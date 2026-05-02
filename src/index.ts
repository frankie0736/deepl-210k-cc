import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Variables, DeepLTranslateResponse, DeepLUsageResponse } from './types';
import { authMiddleware } from './middleware/auth';
import { parseDeepLRequest, normalizeTexts, validateTranslateRequest } from './utils/parser';
import { getCachedTranslation, setCachedTranslation } from './utils/cache';
import { isOpaqueResourceIdentifier } from './utils/translation-boundary';
import { translateBatch } from './services/translator';
import { getGlossaryFingerprint, parseGlossaryInput, selectGlossaryEntries } from './services/glossary';
import {
  createServiceKey, deleteServiceKey, getConfigForAdmin,
  updateConfig, type ConfigUpdates,
} from './services/key-manager';
import { adminPage } from './pages/admin';
import { helpPage } from './pages/help';

// 服务商配置
const PROVIDERS: Record<string, { url: string; defaultModel: string }> = {
  aihubmix: { url: 'https://api.aihubmix.com/v1/chat/completions', defaultModel: 'deepseek-v3.2' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'deepseek/deepseek-v3.2' },
};

function resolveProvider(key: string, provider?: string): string {
  if (provider && PROVIDERS[provider]) return provider;
  return key.includes('-or-') ? 'openrouter' : 'aihubmix';
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS 配置
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// 基础请求观测
app.use('*', async (c, next) => {
  const requestId = c.req.header('X-TP-Request-Id')
    || c.req.header('X-Request-Id')
    || crypto.randomUUID();
  const startedAt = Date.now();
  const url = new URL(c.req.url);

  c.set('requestId', requestId);

  console.log(JSON.stringify({
    event: 'request.start',
    requestId,
    method: c.req.method,
    path: url.pathname,
    contentType: c.req.header('Content-Type') || null,
  }));

  await next();

  c.header('X-Request-Id', requestId);

  console.log(JSON.stringify({
    event: 'request.end',
    requestId,
    method: c.req.method,
    path: url.pathname,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  }));
});

// 健康检查
app.get('/health', (c) => {
  return c.json({
    service: 'DeepL-compatible Translation Proxy',
    status: 'ok',
    version: '1.0.0',
  });
});

// 帮助文档
app.get('/', (c) => {
  return c.html(helpPage(new URL(c.req.url).host));
});

app.get('/help', (c) => {
  return c.html(helpPage(new URL(c.req.url).host));
});

// ─── Admin routes (no auth) ─────────────────────────────────────────────────

app.get('/admin', (c) => {
  return c.html(adminPage());
});

app.get('/admin/config', async (c) => {
  const serviceKey = c.req.query('service_key');
  if (!serviceKey) return c.json({ error: 'service_key is required' }, 400);
  const config = await getConfigForAdmin(c.env.TRANSLATION_CACHE, serviceKey.trim());
  if (!config) return c.json({ error: 'Service key not found' }, 404);
  return c.json(config);
});

app.post('/admin/keys', async (c) => {
  try {
    const body = await c.req.json<{
      domain: string;
      upstreamKey: string;
      provider?: string;
      glossary?: unknown;
    }>();
    if (!body.domain || !body.upstreamKey) {
      return c.json({ error: 'domain and upstreamKey are required' }, 400);
    }
    const key = body.upstreamKey.trim();
    const provider = resolveProvider(key, body.provider);
    const { url, defaultModel: modelName } = PROVIDERS[provider]!;
    const glossary = parseGlossaryInput(body.glossary);
    const serviceKey = await createServiceKey(
      c.env.TRANSLATION_CACHE,
      body.domain.toLowerCase().trim(),
      key,
      url,
      modelName,
      glossary,
    );
    return c.json({ serviceKey, domain: body.domain, provider });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: msg }, 400);
  }
});

app.post('/admin/keys/update', async (c) => {
  try {
    const body = await c.req.json<{
      serviceKey: string;
      upstreamKey?: string;
      provider?: string;
      glossary?: unknown;
    }>();
    if (!body.serviceKey) {
      return c.json({ error: 'serviceKey is required' }, 400);
    }

    const updates: ConfigUpdates = {};
    if (body.upstreamKey?.trim()) {
      const key = body.upstreamKey.trim();
      const provider = resolveProvider(key, body.provider);
      updates.upstreamKey = key;
      updates.upstreamUrl = PROVIDERS[provider]!.url;
      updates.modelName = PROVIDERS[provider]!.defaultModel;
    }

    if (body.glossary !== undefined) {
      updates.glossary = parseGlossaryInput(body.glossary) || [];
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No updates provided' }, 400);
    }

    const result = await updateConfig(c.env.TRANSLATION_CACHE, body.serviceKey.trim(), updates);
    if (!result) {
      return c.json({ error: 'Service key not found' }, 404);
    }
    return c.json({ updated: true, domain: result.domain });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: msg }, 400);
  }
});

app.post('/admin/keys/delete', async (c) => {
  try {
    const { serviceKey } = await c.req.json<{ serviceKey: string }>();
    if (!serviceKey) {
      return c.json({ error: 'serviceKey is required' }, 400);
    }
    const result = await deleteServiceKey(c.env.TRANSLATION_CACHE, serviceKey.trim());
    if (!result) {
      return c.json({ error: 'Service key not found' }, 404);
    }
    return c.json({ deleted: true, domain: result.domain });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: msg }, 400);
  }
});

// ─── DeepL-compatible API routes ────────────────────────────────────────────

// DeepL 支持语言列表（TranslatePress 用 POST 调此端点）
// 因为后端是 LLM，支持的语言远超 DeepL 原生
const handleLanguages = (c: Context<{ Bindings: Env; Variables: Variables }>) => {
  const type = c.req.query('type') || 'target';
  const languages = [
    { language: 'AF', name: 'Afrikaans', supports_formality: false },
    { language: 'AR', name: 'Arabic', supports_formality: false },
    { language: 'BG', name: 'Bulgarian', supports_formality: false },
    { language: 'BN', name: 'Bengali', supports_formality: false },
    { language: 'BS', name: 'Bosnian', supports_formality: false },
    { language: 'CA', name: 'Catalan', supports_formality: false },
    { language: 'CS', name: 'Czech', supports_formality: false },
    { language: 'CY', name: 'Welsh', supports_formality: false },
    { language: 'DA', name: 'Danish', supports_formality: false },
    { language: 'DE', name: 'German', supports_formality: true },
    { language: 'EL', name: 'Greek', supports_formality: false },
    { language: 'EN', name: 'English', supports_formality: false },
    { language: 'EN-GB', name: 'English (British)', supports_formality: false },
    { language: 'EN-US', name: 'English (American)', supports_formality: false },
    { language: 'ES', name: 'Spanish', supports_formality: true },
    { language: 'ET', name: 'Estonian', supports_formality: false },
    { language: 'FA', name: 'Persian', supports_formality: false },
    { language: 'FI', name: 'Finnish', supports_formality: false },
    { language: 'FR', name: 'French', supports_formality: true },
    { language: 'GA', name: 'Irish', supports_formality: false },
    { language: 'GL', name: 'Galician', supports_formality: false },
    { language: 'HE', name: 'Hebrew', supports_formality: false },
    { language: 'HI', name: 'Hindi', supports_formality: false },
    { language: 'HR', name: 'Croatian', supports_formality: false },
    { language: 'HU', name: 'Hungarian', supports_formality: false },
    { language: 'HY', name: 'Armenian', supports_formality: false },
    { language: 'ID', name: 'Indonesian', supports_formality: false },
    { language: 'IS', name: 'Icelandic', supports_formality: false },
    { language: 'IT', name: 'Italian', supports_formality: true },
    { language: 'JA', name: 'Japanese', supports_formality: false },
    { language: 'KA', name: 'Georgian', supports_formality: false },
    { language: 'KK', name: 'Kazakh', supports_formality: false },
    { language: 'KO', name: 'Korean', supports_formality: false },
    { language: 'LT', name: 'Lithuanian', supports_formality: false },
    { language: 'LV', name: 'Latvian', supports_formality: false },
    { language: 'MK', name: 'Macedonian', supports_formality: false },
    { language: 'MN', name: 'Mongolian', supports_formality: false },
    { language: 'MS', name: 'Malay', supports_formality: false },
    { language: 'MT', name: 'Maltese', supports_formality: false },
    { language: 'NB', name: 'Norwegian (Bokmål)', supports_formality: false },
    { language: 'NL', name: 'Dutch', supports_formality: true },
    { language: 'NO', name: 'Norwegian', supports_formality: false },
    { language: 'PL', name: 'Polish', supports_formality: true },
    { language: 'PT', name: 'Portuguese', supports_formality: true },
    { language: 'PT-BR', name: 'Portuguese (Brazilian)', supports_formality: true },
    { language: 'PT-PT', name: 'Portuguese (European)', supports_formality: true },
    { language: 'RO', name: 'Romanian', supports_formality: false },
    { language: 'RU', name: 'Russian', supports_formality: true },
    { language: 'SK', name: 'Slovak', supports_formality: false },
    { language: 'SL', name: 'Slovenian', supports_formality: false },
    { language: 'SQ', name: 'Albanian', supports_formality: false },
    { language: 'SR', name: 'Serbian', supports_formality: false },
    { language: 'SV', name: 'Swedish', supports_formality: false },
    { language: 'SW', name: 'Swahili', supports_formality: false },
    { language: 'TA', name: 'Tamil', supports_formality: false },
    { language: 'TH', name: 'Thai', supports_formality: false },
    { language: 'TL', name: 'Tagalog', supports_formality: false },
    { language: 'TR', name: 'Turkish', supports_formality: false },
    { language: 'UK', name: 'Ukrainian', supports_formality: false },
    { language: 'UR', name: 'Urdu', supports_formality: false },
    { language: 'VI', name: 'Vietnamese', supports_formality: false },
    { language: 'ZH', name: 'Chinese (simplified)', supports_formality: false },
    { language: 'ZH-HANS', name: 'Chinese (simplified)', supports_formality: false },
    { language: 'ZH-HANT', name: 'Chinese (traditional)', supports_formality: false },
  ];

  if (type === 'source') {
    return c.json(languages.filter(l => !l.language.includes('-')));
  }
  return c.json(languages);
};
app.get('/v2/languages', handleLanguages);
app.post('/v2/languages', handleLanguages);

// DeepL 配额查询接口
app.get('/v2/usage', authMiddleware, async (c) => {
  const response: DeepLUsageResponse = {
    character_count: 0,
    character_limit: 100000000,
  };

  return c.json(response);
});

// DeepL 翻译接口
app.post('/v2/translate', authMiddleware, async (c) => {
  const requestId = c.get('requestId');
  try {
    // 1. 解析请求
    const request = await parseDeepLRequest(c);
    const texts = normalizeTexts(request.text);
    const targetLang = request.target_lang;
    const sourceLang = request.source_lang;
    const formality = request.formality;
    const tagHandling = request.tag_handling;
    const domainConfig = c.get('domainConfig');
    const glossary = selectGlossaryEntries(domainConfig.glossary, targetLang);
    const glossaryHash = getGlossaryFingerprint(glossary);

    console.log(JSON.stringify({
      event: 'translate.request',
      requestId,
      authSource: c.get('authSource'),
      textCount: texts.length,
      targetLang,
      sourceLang: sourceLang || 'auto',
      formality: formality || 'default',
      tagHandling: tagHandling || null,
      glossaryCount: glossary.length,
    }));

    // 2. 验证参数
    const validation = validateTranslateRequest(texts, targetLang);
    if (!validation.valid) {
      return c.json({ message: validation.error }, 400);
    }

    // 3. 获取域名配置和环境变量（per-domain 优先，fallback 到全局）
    const upstreamUrl = domainConfig.upstreamUrl || c.env.UPSTREAM_API_URL;
    const modelName = domainConfig.modelName || c.env.MODEL_NAME;
    const cacheTTL = parseInt(c.env.CACHE_TTL_SECONDS || '2592000');

    // 4. 检查缓存，收集未命中的文本
    const results: (string | null)[] = new Array(texts.length).fill(null);
    const cacheKeys: string[] = new Array(texts.length);
    const missIndices: number[] = [];
    let passthroughCount = 0;

    await Promise.all(
      texts.map(async (text, i) => {
        if (isOpaqueResourceIdentifier(text)) {
          results[i] = text;
          passthroughCount += 1;
          return;
        }

        const { translation, cacheKey } = await getCachedTranslation(c.env.TRANSLATION_CACHE, {
          text,
          sourceLang: sourceLang || 'auto',
          targetLang,
          formality,
          glossaryHash,
        });
        cacheKeys[i] = cacheKey;
        if (translation) {
          results[i] = translation;
        } else {
          missIndices.push(i);
        }
      })
    );

    console.log(JSON.stringify({
      event: 'translate.cache',
      requestId,
      textCount: texts.length,
      hitCount: texts.length - missIndices.length - passthroughCount,
      passthroughCount,
      missCount: missIndices.length,
    }));

    // 5. 批量翻译所有未命中的文本（1 次或少量 API 调用）
    if (missIndices.length > 0) {
      const missTexts = missIndices.map(i => texts[i]!);
      const upstreamStartedAt = Date.now();
      const translated = await translateBatch(
        domainConfig.upstreamKey,
        upstreamUrl,
        modelName,
        missTexts,
        sourceLang,
        targetLang,
        formality,
        tagHandling,
        glossary,
      );

      console.log(JSON.stringify({
        event: 'translate.upstream',
        requestId,
        providerUrl: upstreamUrl,
        modelName,
        missCount: missTexts.length,
        durationMs: Date.now() - upstreamStartedAt,
      }));

      // 回填结果 + 写入缓存（复用预计算的 cacheKey）
      await Promise.all(
        missIndices.map(async (origIdx, j) => {
          const translatedText = translated[j] ?? texts[origIdx]!;
          results[origIdx] = translatedText;

          await setCachedTranslation(
            c.env.TRANSLATION_CACHE,
            cacheKeys[origIdx]!,
            translatedText,
            cacheTTL,
          );
        })
      );
    }

    // 6. 组装响应
    const missSet = new Set(missIndices);
    const translations = texts.map((text, i) => ({
      detected_source_language: sourceLang || 'EN',
      text: results[i] ?? text,
      billed_characters: results[i] !== null && missSet.has(i) ? text.length : 0,
    }));

    // 7. 返回 DeepL 格式响应
    const response: DeepLTranslateResponse = {
      translations,
    };

    console.log(JSON.stringify({
      event: 'translate.response',
      requestId,
      translationCount: translations.length,
      billedCharacters: translations.reduce((sum, item) => sum + (item.billed_characters || 0), 0),
    }));

    return c.json(response);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'translate.error',
      requestId,
      message: error instanceof Error ? error.message : 'Internal translation error',
    }));

    const errorMessage = error instanceof Error ? error.message : 'Internal translation error';

    return c.json(
      {
        message: errorMessage,
      },
      500
    );
  }
});

// 404 处理
app.notFound((c) => {
  return c.json({ message: 'Not found' }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error(JSON.stringify({
    event: 'request.error',
    requestId: c.get('requestId'),
    path: new URL(c.req.url).pathname,
    message: err.message,
  }));
  return c.json({ message: 'Internal server error' }, 500);
});

export default app;
