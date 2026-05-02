import type { Context } from 'hono';
import type { AuthSource, DeepLTranslateRequest } from '../types';

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json');
}

function isFormContentType(contentType: string): boolean {
  return contentType.includes('application/x-www-form-urlencoded');
}

async function parseRequestBody(c: Context): Promise<Record<string, unknown>> {
  const contentType = c.req.header('Content-Type') || '';

  if (isJsonContentType(contentType)) {
    return await c.req.json<Record<string, unknown>>();
  }

  if (isFormContentType(contentType)) {
    return await c.req.parseBody({ all: true }) as Record<string, unknown>;
  }

  try {
    return await c.req.json<Record<string, unknown>>();
  } catch {
    throw new Error('Unsupported Content-Type');
  }
}

/**
 * 解析 DeepL 翻译请求
 * 支持 JSON 和 application/x-www-form-urlencoded 格式
 */
export async function parseDeepLRequest(c: Context): Promise<DeepLTranslateRequest> {
  return await parseRequestBody(c) as unknown as DeepLTranslateRequest;
}

/**
 * 提取 DeepL 风格 API Key，兼容 header / query / body 三种来源
 */
export async function extractApiKey(c: Context): Promise<{ apiKey: string | null; source: AuthSource | null }> {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('DeepL-Auth-Key ')) {
    return {
      apiKey: authHeader.slice('DeepL-Auth-Key '.length).trim(),
      source: 'header',
    };
  }

  const queryKey = c.req.query('auth_key');
  if (queryKey) {
    return {
      apiKey: queryKey,
      source: 'query',
    };
  }

  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    return { apiKey: null, source: null };
  }

  try {
    const body = await parseRequestBody(c);
    const bodyKey = body.auth_key;
    if (typeof bodyKey === 'string' && bodyKey.trim()) {
      return {
        apiKey: bodyKey.trim(),
        source: 'body',
      };
    }
  } catch {
    // Ignore body parsing errors here; route handlers will validate body later.
  }

  return { apiKey: null, source: null };
}

/**
 * 规范化 text 参数为数组
 */
export function normalizeTexts(text: string | string[]): string[] {
  if (!text) return [];
  if (typeof text === 'string') return [text];
  if (Array.isArray(text)) return text;
  return [String(text)];
}

/**
 * 验证必需参数
 */
export function validateTranslateRequest(
  texts: string[],
  targetLang: string | undefined
): { valid: boolean; error?: string } {
  if (!texts.length) {
    return { valid: false, error: 'Missing required parameter: text' };
  }

  if (!targetLang) {
    return { valid: false, error: 'Missing required parameter: target_lang' };
  }

  return { valid: true };
}
