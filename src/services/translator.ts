import type { OpenAIChatRequest, OpenAIChatResponse } from '../types';

/**
 * 语言代码映射（DeepL -> 全称）
 */
const LANGUAGE_MAP: Record<string, string> = {
  EN: 'English',
  'EN-GB': 'British English',
  'EN-US': 'American English',
  DE: 'German',
  FR: 'French',
  ES: 'Spanish',
  IT: 'Italian',
  NL: 'Dutch',
  PL: 'Polish',
  PT: 'Portuguese',
  'PT-BR': 'Brazilian Portuguese',
  'PT-PT': 'European Portuguese',
  RU: 'Russian',
  JA: 'Japanese',
  ZH: 'Chinese',
  'ZH-HANS': 'Simplified Chinese',
  'ZH-HANT': 'Traditional Chinese',
  KO: 'Korean',
  AR: 'Arabic',
  TR: 'Turkish',
  HI: 'Hindi',
  BG: 'Bulgarian',
  CS: 'Czech',
  DA: 'Danish',
  EL: 'Greek',
  ET: 'Estonian',
  FI: 'Finnish',
  HU: 'Hungarian',
  ID: 'Indonesian',
  LT: 'Lithuanian',
  LV: 'Latvian',
  NB: 'Norwegian',
  RO: 'Romanian',
  SK: 'Slovak',
  SL: 'Slovenian',
  SV: 'Swedish',
  UK: 'Ukrainian',
};

function getLanguageName(code: string): string {
  return LANGUAGE_MAP[code.toUpperCase()] || code;
}

// ── 批量翻译配置 ─────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 20;
const MAX_BATCH_CHARS = 5000;

// ── 批量翻译（numbered JSON 方案）──────────────────────────────────────────

/**
 * 批量翻译入口：自动分块，JSON 批量调用，失败自动降级逐条翻译
 */
export async function translateBatch(
  upstreamKey: string,
  upstreamUrl: string,
  modelName: string,
  texts: string[],
  sourceLang: string | undefined,
  targetLang: string,
  formality?: string,
  tagHandling?: string,
): Promise<string[]> {
  if (texts.length === 0) return [];

  // 单条文本直接走单条翻译
  if (texts.length === 1) {
    const result = await translateSingle(
      upstreamKey, upstreamUrl, modelName,
      texts[0]!, sourceLang, targetLang, formality, tagHandling,
    );
    return [result];
  }

  // 分块
  const chunks = splitIntoChunks(texts);
  const results: string[] = [];

  for (const chunk of chunks) {
    const translated = await translateChunk(
      upstreamKey, upstreamUrl, modelName,
      chunk, sourceLang, targetLang, formality, tagHandling,
    );
    results.push(...translated);
  }

  return results;
}

/**
 * 将文本列表按大小限制分块
 */
function splitIntoChunks(texts: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    if (current.length >= MAX_BATCH_SIZE || currentChars + text.length > MAX_BATCH_CHARS) {
      if (current.length > 0) chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

/**
 * 翻译一个 chunk — JSON 批量，失败降级逐条
 */
async function translateChunk(
  upstreamKey: string,
  upstreamUrl: string,
  modelName: string,
  texts: string[],
  sourceLang: string | undefined,
  targetLang: string,
  formality?: string,
  tagHandling?: string,
): Promise<string[]> {
  // 尝试批量
  try {
    return await translateBatchJSON(
      upstreamKey, upstreamUrl, modelName,
      texts, sourceLang, targetLang, formality, tagHandling,
    );
  } catch (e) {
    console.warn(`Batch translation failed, falling back to single: ${(e as Error).message}`);
  }

  // 降级：逐条翻译
  const results: string[] = [];
  for (const text of texts) {
    const result = await translateSingle(
      upstreamKey, upstreamUrl, modelName,
      text, sourceLang, targetLang, formality, tagHandling,
    );
    results.push(result);
  }
  return results;
}

/**
 * JSON 批量翻译 — 1 次 API 调用翻译多段文本
 */
async function translateBatchJSON(
  upstreamKey: string,
  upstreamUrl: string,
  modelName: string,
  texts: string[],
  sourceLang: string | undefined,
  targetLang: string,
  formality?: string,
  tagHandling?: string,
): Promise<string[]> {
  const targetName = getLanguageName(targetLang);
  const sourceName = sourceLang ? getLanguageName(sourceLang) : 'auto-detect';

  // 构建 numbered JSON input
  const input: Record<string, string> = {};
  for (let i = 0; i < texts.length; i++) {
    input[String(i)] = texts[i]!;
  }

  let prompt = `You are a professional translation engine. Translate all values in the JSON object below from ${sourceName} to ${targetName}.`;

  if (formality === 'more' || formality === 'prefer_more') {
    prompt += '\nUse formal language and polite expressions.';
  } else if (formality === 'less' || formality === 'prefer_less') {
    prompt += '\nUse informal language and casual expressions.';
  }

  if (tagHandling === 'html' || tagHandling === 'xml') {
    prompt += '\nPreserve all HTML/XML tags, only translate text content inside tags.';
  }

  prompt += '\n\nRules:';
  prompt += '\n1. Return ONLY a valid JSON object with the same keys';
  prompt += '\n2. Each key must map to the translated text';
  prompt += '\n3. Preserve all HTML tags, placeholders like {variable}, and special characters';
  prompt += '\n4. If a value is empty string, keep it as empty string';
  prompt += '\n5. Do NOT add any explanation, markdown, or extra text outside the JSON';

  prompt += '\n\nInput:\n' + JSON.stringify(input, null, 2);

  const maxTokens = 1024 + texts.length * 256;

  const requestBody: OpenAIChatRequest = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: maxTokens,
  };

  const response = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${upstreamKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const raw = data.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('No content in LLM response');

  // 解析 JSON（兼容 ```json``` 包裹）
  let jsonStr = raw;
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1]!.trim();
  }

  const parsed = JSON.parse(jsonStr);
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Response is not a JSON object');
  }

  // 校验 key 数量
  const keys = Object.keys(parsed);
  if (keys.length !== texts.length) {
    throw new Error(`Key count mismatch: expected ${texts.length}, got ${keys.length}`);
  }

  // 按序提取结果
  const results: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    const val = parsed[String(i)];
    if (typeof val !== 'string') {
      throw new Error(`Missing or invalid value for key "${i}"`);
    }
    results.push(val);
  }

  console.log(`Batch translated ${texts.length} texts (${texts.reduce((a, t) => a + t.length, 0)} chars) to ${targetLang}`);
  return results;
}

// ── 单条翻译（降级用 + 单文本场景）──────────────────────────────────────────

async function translateSingle(
  upstreamKey: string,
  upstreamUrl: string,
  modelName: string,
  text: string,
  sourceLang: string | undefined,
  targetLang: string,
  formality?: string,
  tagHandling?: string,
  maxRetries: number = 2,
): Promise<string> {
  const targetName = getLanguageName(targetLang);
  const sourceName = sourceLang ? getLanguageName(sourceLang) : 'auto-detect';

  let prompt = `You are a professional translation engine. Translate the following text from ${sourceName} to ${targetName}.`;

  if (formality === 'more' || formality === 'prefer_more') {
    prompt += '\nUse formal language and polite expressions.';
  } else if (formality === 'less' || formality === 'prefer_less') {
    prompt += '\nUse informal language and casual expressions.';
  }

  if (tagHandling === 'html' || tagHandling === 'xml') {
    prompt += '\nPreserve all HTML/XML tags and only translate the text content inside tags.';
    prompt += '\nDo not modify any tag attributes or structure.';
  }

  prompt += '\n\nRules:';
  prompt += '\n1. Only output the translated text, no explanations';
  prompt += '\n2. Preserve all placeholders like {variable}, [placeholder], etc.';
  prompt += '\n3. Maintain the same formatting and line breaks';
  prompt += '\n4. Keep special characters and punctuation marks';
  prompt += '\n\nText to translate:\n' + text;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const requestBody: OpenAIChatRequest = {
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4096,
      };

      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${upstreamKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OpenAIChatResponse;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('No translation result from LLM');

      return content;
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries) {
        console.warn(`Translation retry ${attempt + 1}/${maxRetries} for: ${text.substring(0, 50)}...`);
        await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
      }
    }
  }

  throw lastError!;
}
