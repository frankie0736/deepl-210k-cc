import type { Context, Next } from 'hono';
import type { Env, Variables } from '../types';
import { getConfigByServiceKey } from '../services/key-manager';
import { extractApiKey } from '../utils/parser';

/**
 * 认证中间件 — 通过 serviceKey 查 KV 获取域名配置
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next,
) {
  const { apiKey, source } = await extractApiKey(c);
  const requestId = c.get('requestId');

  if (!apiKey) {
    console.warn(JSON.stringify({
      event: 'auth.missing',
      requestId,
      path: new URL(c.req.url).pathname,
      method: c.req.method,
    }));
    return c.json({ message: 'Authorization required' }, 403);
  }

  const config = await getConfigByServiceKey(c.env.TRANSLATION_CACHE, apiKey);

  if (!config) {
    console.warn(JSON.stringify({
      event: 'auth.invalid',
      requestId,
      source,
      path: new URL(c.req.url).pathname,
      method: c.req.method,
    }));
    return c.json({ message: 'Authorization failed: Invalid API key' }, 403);
  }

  c.set('authSource', source);
  c.set('domainConfig', config);

  console.log(JSON.stringify({
    event: 'auth.ok',
    requestId,
    source,
    domain: config.domain,
    path: new URL(c.req.url).pathname,
  }));

  await next();
}
