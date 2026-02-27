import type { Context, Next } from 'hono';
import type { Env, Variables } from '../types';
import { getConfigByServiceKey } from '../services/key-manager';

/**
 * 从请求中提取 API Key
 */
export function extractApiKey(c: Context): string | null {
  // 1. Authorization header: "DeepL-Auth-Key xxx"
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('DeepL-Auth-Key ')) {
    return authHeader.slice('DeepL-Auth-Key '.length).trim();
  }

  // 2. query 参数 auth_key
  const queryKey = c.req.query('auth_key');
  if (queryKey) {
    return queryKey;
  }

  return null;
}

/**
 * 认证中间件 — 通过 serviceKey 查 KV 获取域名配置
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next,
) {
  const apiKey = extractApiKey(c);

  if (!apiKey) {
    return c.json({ message: 'Authorization required' }, 403);
  }

  const config = await getConfigByServiceKey(c.env.TRANSLATION_CACHE, apiKey);

  if (!config) {
    return c.json({ message: 'Authorization failed: Invalid API key' }, 403);
  }

  c.set('domainConfig', config);
  await next();
}
