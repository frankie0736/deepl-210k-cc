/**
 * 验证批量翻译方案：numbered JSON object in → numbered JSON object out
 *
 * 用法: AIHUBMIX_KEY=sk-xxx bun scripts/test-batch-translate.ts
 */

const API_URL = 'https://api.aihubmix.com/v1/chat/completions';
const MODEL = 'deepseek-v3.2';
const KEY = process.env.AIHUBMIX_KEY;

if (!KEY) {
  console.error('请设置 AIHUBMIX_KEY 环境变量');
  process.exit(1);
}

// ── 测试用例 ────────────────────────────────────────────────────────────────

const testTexts = [
  'Hello World',
  'Contact us for more information',
  '<h2>Our Products</h2><p>We offer high-quality drilling tools.</p>',
  'Free shipping on orders over $500',
  '请注意：此文本已经是中文',  // 已经是目标语言的 edge case
  '{variable_name} items in your cart',
  '',  // 空字符串 edge case
  'A',  // 极短文本
  'The quick brown fox jumps over the lazy dog. This is a longer sentence to test how the model handles paragraph-length content with multiple clauses and ideas.',
  'Terms & Conditions | Privacy Policy | © 2024 All Rights Reserved',
];

// ── 构建 prompt ─────────────────────────────────────────────────────────────

function buildBatchPrompt(
  texts: string[],
  targetLang: string,
  sourceLang?: string,
  tagHandling?: string,
): string {
  const input: Record<string, string> = {};
  for (let i = 0; i < texts.length; i++) {
    input[String(i)] = texts[i];
  }

  let prompt = `You are a professional translation engine. Translate all values in the JSON object below to ${targetLang}.`;

  if (sourceLang) {
    prompt += ` Source language: ${sourceLang}.`;
  }

  if (tagHandling === 'html') {
    prompt += '\nPreserve all HTML/XML tags, only translate text content inside tags.';
  }

  prompt += '\n\nRules:';
  prompt += '\n1. Return ONLY a valid JSON object with the same keys';
  prompt += '\n2. Each key must map to the translated text';
  prompt += '\n3. Preserve all HTML tags, placeholders like {variable}, and special characters';
  prompt += '\n4. If a value is empty string, keep it as empty string';
  prompt += '\n5. Do NOT add any explanation, markdown, or extra text outside the JSON';

  prompt += '\n\nInput:\n' + JSON.stringify(input, null, 2);

  return prompt;
}

// ── 调用 API ────────────────────────────────────────────────────────────────

async function callLLM(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content?.trim();
  const usage = data.usage;

  console.log(`  tokens: prompt=${usage?.prompt_tokens} completion=${usage?.completion_tokens} total=${usage?.total_tokens}`);

  return content;
}

// ── 解析响应 ─────────────────────────────────────────────────────────────────

function parseResponse(raw: string, expectedCount: number): Record<string, string> | null {
  // 尝试提取 JSON（模型可能包裹在 ```json ... ``` 中）
  let jsonStr = raw;
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.error('  ✗ 响应不是 JSON object');
      return null;
    }

    const keys = Object.keys(parsed);
    if (keys.length !== expectedCount) {
      console.error(`  ✗ key 数量不匹配: 期望 ${expectedCount}, 实际 ${keys.length}`);
      return null;
    }

    // 检查所有期望的 key 都在
    for (let i = 0; i < expectedCount; i++) {
      if (!(String(i) in parsed)) {
        console.error(`  ✗ 缺少 key "${i}"`);
        return null;
      }
    }

    return parsed;
  } catch (e) {
    console.error(`  ✗ JSON 解析失败: ${(e as Error).message}`);
    console.error(`  原始响应前 200 字符: ${raw.substring(0, 200)}`);
    return null;
  }
}

// ── 运行测试 ─────────────────────────────────────────────────────────────────

async function runTest(targetLang: string, texts: string[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试: ${texts.length} 段文本 → ${targetLang}`);
  console.log(`${'='.repeat(60)}`);

  const prompt = buildBatchPrompt(texts, targetLang, undefined, 'html');
  const maxTokens = 1024 + texts.length * 256;

  console.log(`  max_tokens: ${maxTokens}`);

  const start = Date.now();
  const raw = await callLLM(prompt, maxTokens);
  const elapsed = Date.now() - start;

  console.log(`  耗时: ${elapsed}ms`);

  const parsed = parseResponse(raw, texts.length);

  if (!parsed) {
    console.log('\n  原始响应:');
    console.log(raw);
    return false;
  }

  console.log('\n  结果对比:');
  let allGood = true;
  for (let i = 0; i < texts.length; i++) {
    const src = texts[i];
    const dst = parsed[String(i)];
    const ok = dst !== undefined && typeof dst === 'string';

    // 检查 HTML 是否保留
    const srcHasTags = /<[^>]+>/.test(src);
    const dstHasTags = /<[^>]+>/.test(dst);
    const htmlOk = !srcHasTags || dstHasTags;

    // 检查占位符是否保留
    const srcPlaceholders = src.match(/\{[^}]+\}/g) || [];
    const dstPlaceholders = dst.match(/\{[^}]+\}/g) || [];
    const placeholderOk = srcPlaceholders.length === dstPlaceholders.length;

    const status = ok && htmlOk && placeholderOk ? '✓' : '✗';
    if (status === '✗') allGood = false;

    const flags = [];
    if (!htmlOk) flags.push('HTML丢失');
    if (!placeholderOk) flags.push('占位符丢失');

    console.log(`  [${i}] ${status} "${src.substring(0, 40)}${src.length > 40 ? '...' : ''}"`);
    console.log(`       → "${dst.substring(0, 40)}${dst.length > 40 ? '...' : ''}" ${flags.join(' ')}`);
  }

  return allGood;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('批量翻译方案验证');
  console.log(`API: ${API_URL}`);
  console.log(`Model: ${MODEL}`);

  let pass = 0;
  let fail = 0;

  // 测试 1: 完整 10 段 → 中文
  (await runTest('Chinese', testTexts)) ? pass++ : fail++;

  // 测试 2: 完整 10 段 → 俄语
  (await runTest('Russian', testTexts)) ? pass++ : fail++;

  // 测试 3: 只有 2 段（小批量）
  (await runTest('Japanese', testTexts.slice(0, 2))) ? pass++ : fail++;

  // 测试 4: 只有 1 段（边界）
  (await runTest('French', testTexts.slice(0, 1))) ? pass++ : fail++;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`总结: ${pass} 通过, ${fail} 失败`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
