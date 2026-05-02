const ABSOLUTE_URL_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:']);

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ABSOLUTE_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function isSrcsetDescriptor(value: string): boolean {
  return /^\d+w$/i.test(value) || /^\d+(?:\.\d+)?x$/i.test(value);
}

function isUrlCandidateList(value: string): boolean {
  const candidates = value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  if (candidates.length < 2) {
    return false;
  }

  return candidates.every((candidate) => {
    const parts = candidate.split(/\s+/).filter(Boolean);
    if (parts.length === 0 || !isAbsoluteUrl(parts[0]!)) {
      return false;
    }

    return parts.slice(1).every(isSrcsetDescriptor);
  });
}

export function isOpaqueResourceIdentifier(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  return isAbsoluteUrl(trimmed) || isUrlCandidateList(trimmed);
}
