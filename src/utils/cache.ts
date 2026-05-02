import type { CacheKeyParams } from '../types';

/**
 * 生成缓存键
 * 格式: cache:sha256(text+sourceLang+targetLang+formality+glossaryHash)
 */
export async function generateCacheKey(params: CacheKeyParams): Promise<string> {
  const { text, sourceLang, targetLang, formality, glossaryHash } = params;
  const content = `${text}|${sourceLang}|${targetLang}|${formality || 'default'}|${glossaryHash || 'none'}`;

  // 使用 Web Crypto API 生成 MD5 哈希
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return `cache:${hashHex}`;
}

/**
 * 从 KV 缓存中获取翻译结果，同时返回 cacheKey 供后续写入复用
 */
export async function getCachedTranslation(
  kv: KVNamespace,
  params: CacheKeyParams
): Promise<{ translation: string | null; cacheKey: string }> {
  const cacheKey = await generateCacheKey(params);
  const cached = await kv.get(cacheKey, { cacheTtl: 60 });
  return { translation: cached, cacheKey };
}

/**
 * 将翻译结果存入 KV 缓存（接受预计算的 cacheKey，避免重复 SHA-256）
 */
export async function setCachedTranslation(
  kv: KVNamespace,
  cacheKey: string,
  translation: string,
  ttlSeconds: number
): Promise<void> {
  await kv.put(cacheKey, translation, {
    expirationTtl: ttlSeconds,
  });
}
