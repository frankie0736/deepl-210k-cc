import type { Context } from 'hono';
import type { DeepLTranslateRequest } from '../types';

/**
 * 解析 DeepL 翻译请求
 * 支持 JSON 和 application/x-www-form-urlencoded 格式
 */
export async function parseDeepLRequest(c: Context): Promise<DeepLTranslateRequest> {
  const contentType = c.req.header('Content-Type') || '';

  let body: any;

  if (contentType.includes('application/json')) {
    // JSON 格式
    body = await c.req.json();
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    // Form 格式
    const formData = await c.req.parseBody();
    body = formData;
  } else {
    // 尝试作为 JSON 解析
    try {
      body = await c.req.json();
    } catch {
      throw new Error('Unsupported Content-Type');
    }
  }

  return body as DeepLTranslateRequest;
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
