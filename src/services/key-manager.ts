/**
 * KV-based domain config CRUD
 *
 * KV key layout (shares TRANSLATION_CACHE namespace):
 *   config:{serviceKey}  → DomainConfig JSON   (auth lookup)
 *   domain:{domain}      → serviceKey string    (reverse index)
 *   cache:*              → translation cache    (no conflict)
 */

import type { GlossaryEntry } from './glossary';

export interface DomainConfig {
  domain: string;
  serviceKey: string;
  upstreamKey: string;
  upstreamUrl?: string;
  modelName?: string;
  glossary?: GlossaryEntry[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createServiceKey(
  kv: KVNamespace,
  domain: string,
  upstreamKey: string,
  upstreamUrl: string,
  modelName?: string,
  glossary?: GlossaryEntry[],
): Promise<string> {
  // 1. Check duplicate
  const existing = await kv.get(`domain:${domain}`);
  if (existing) {
    throw new Error(`Domain "${domain}" already registered`);
  }

  // 2. Validate upstream key
  const valid = await validateUpstreamKey(upstreamUrl, upstreamKey, modelName);
  if (!valid) {
    throw new Error('Upstream key validation failed (401/403 or network error)');
  }

  // 3. Generate serviceKey
  const serviceKey = `${crypto.randomUUID()}:fx`;

  // 4. Write both KV entries
  const config: DomainConfig = {
    domain,
    serviceKey,
    upstreamKey,
    upstreamUrl,
    modelName,
    glossary,
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    kv.put(`config:${serviceKey}`, JSON.stringify(config)),
    kv.put(`domain:${domain}`, serviceKey),
  ]);

  return serviceKey;
}

// ---------------------------------------------------------------------------
// Admin lookup (service_key is the sole credential)
// ---------------------------------------------------------------------------

export async function getConfigForAdmin(
  kv: KVNamespace,
  serviceKey: string,
): Promise<(Omit<DomainConfig, 'upstreamKey'> & { maskedUpstreamKey: string }) | null> {
  const raw = await kv.get(`config:${serviceKey}`);
  if (!raw) return null;
  const config: DomainConfig = JSON.parse(raw);
  const { upstreamKey, ...rest } = config;
  return { ...rest, maskedUpstreamKey: maskKey(upstreamKey) };
}

// ---------------------------------------------------------------------------
// Delete (only needs serviceKey)
// ---------------------------------------------------------------------------

export async function deleteServiceKey(
  kv: KVNamespace,
  serviceKey: string,
): Promise<{ domain: string } | null> {
  const raw = await kv.get(`config:${serviceKey}`);
  if (!raw) return null;

  const config: DomainConfig = JSON.parse(raw);

  await Promise.all([
    kv.delete(`config:${serviceKey}`),
    kv.delete(`domain:${config.domain}`),
  ]);

  return { domain: config.domain };
}

// ---------------------------------------------------------------------------
// Update config (service_key is the sole credential)
// ---------------------------------------------------------------------------

export interface ConfigUpdates {
  upstreamKey?: string;
  upstreamUrl?: string;
  modelName?: string;
  glossary?: GlossaryEntry[];
}

export async function updateConfig(
  kv: KVNamespace,
  serviceKey: string,
  updates: ConfigUpdates,
): Promise<DomainConfig | null> {
  const raw = await kv.get(`config:${serviceKey}`);
  if (!raw) return null;

  const config: DomainConfig = JSON.parse(raw);

  // If upstreamKey changes, validate it
  if (updates.upstreamKey) {
    const url = updates.upstreamUrl || config.upstreamUrl || '';
    const model = updates.modelName || config.modelName;
    const valid = await validateUpstreamKey(url, updates.upstreamKey, model);
    if (!valid) {
      throw new Error('Upstream key validation failed (401/403 or network error)');
    }
    config.upstreamKey = updates.upstreamKey;
  }

  if (updates.upstreamUrl) config.upstreamUrl = updates.upstreamUrl;
  if (updates.modelName) config.modelName = updates.modelName;
  if (updates.glossary !== undefined) config.glossary = updates.glossary;

  await kv.put(`config:${serviceKey}`, JSON.stringify(config));
  return config;
}

// ---------------------------------------------------------------------------
// Auth lookup (used by middleware)
// ---------------------------------------------------------------------------

export async function getConfigByServiceKey(
  kv: KVNamespace,
  serviceKey: string,
): Promise<DomainConfig | null> {
  const raw = await kv.get(`config:${serviceKey}`, { cacheTtl: 300 });
  if (!raw) return null;
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Validate upstream key by sending a minimal request
// ---------------------------------------------------------------------------

export async function validateUpstreamKey(
  upstreamUrl: string,
  upstreamKey: string,
  modelName = 'deepseek-v3.2',
): Promise<boolean> {
  try {
    const res = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${upstreamKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
