export interface GlossaryEntry {
  targetLang: string;
  source: string;
  target: string;
}

function normalizeEntry(entry: GlossaryEntry): GlossaryEntry {
  return {
    targetLang: entry.targetLang.trim().toUpperCase(),
    source: entry.source.trim(),
    target: entry.target.trim(),
  };
}

export function parseGlossaryInput(input: unknown): GlossaryEntry[] | undefined {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }

  const parsed = typeof input === 'string'
    ? JSON.parse(input) as unknown
    : input;

  if (!Array.isArray(parsed)) {
    throw new Error('glossary must be an array');
  }

  const entries = parsed.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`glossary[${index}] must be an object`);
    }

    const { targetLang, source, target } = value as Record<string, unknown>;
    if (typeof targetLang !== 'string' || !targetLang.trim()) {
      throw new Error(`glossary[${index}].targetLang is required`);
    }
    if (typeof source !== 'string' || !source.trim()) {
      throw new Error(`glossary[${index}].source is required`);
    }
    if (typeof target !== 'string' || !target.trim()) {
      throw new Error(`glossary[${index}].target is required`);
    }

    return normalizeEntry({
      targetLang,
      source,
      target,
    });
  });

  return dedupeGlossaryEntries(entries);
}

export function selectGlossaryEntries(
  glossary: GlossaryEntry[] | undefined,
  targetLang: string,
): GlossaryEntry[] {
  if (!glossary?.length) return [];
  const normalizedTargetLang = targetLang.trim().toUpperCase();
  return glossary
    .map(normalizeEntry)
    .filter((entry) => entry.targetLang === normalizedTargetLang);
}

export function buildGlossaryPromptSection(glossary: GlossaryEntry[]): string {
  if (!glossary.length) return '';

  const lines = glossary.map((entry) => `- "${entry.source}" => "${entry.target}"`);
  return `\n\nRequired terminology:\n${lines.join('\n')}`;
}

export function getGlossaryFingerprint(glossary: GlossaryEntry[]): string {
  if (!glossary.length) return 'none';

  return glossary
    .map(normalizeEntry)
    .sort((left, right) => {
      const targetLangCompare = left.targetLang.localeCompare(right.targetLang);
      if (targetLangCompare !== 0) return targetLangCompare;

      const sourceCompare = left.source.localeCompare(right.source);
      if (sourceCompare !== 0) return sourceCompare;

      return left.target.localeCompare(right.target);
    })
    .map((entry) => `${entry.targetLang}:${entry.source}=>${entry.target}`)
    .join('|');
}

function dedupeGlossaryEntries(glossary: GlossaryEntry[]): GlossaryEntry[] {
  const seen = new Set<string>();
  const unique: GlossaryEntry[] = [];

  for (const entry of glossary) {
    const normalized = normalizeEntry(entry);
    const key = `${normalized.targetLang}\u0000${normalized.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}
