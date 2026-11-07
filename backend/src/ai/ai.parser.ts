export type Verdict = 'pass' | 'review' | 'fail';

export interface ParsedAiResult {
  verdict: Verdict;
  confidence: number;
  findings: string[];
  extracted: { crop?: string; stage?: string; kg?: number; grade?: string };
  summaryEn: string;
  parseOk: boolean;
}

const VERDICTS: Record<string, Verdict> = {
  pass: 'pass',
  passed: 'pass',
  ok: 'pass',
  valid: 'pass',
  review: 'review',
  uncertain: 'review',
  unsure: 'review',
  needs_review: 'review',
  'needs review': 'review',
  fail: 'fail',
  failed: 'fail',
  invalid: 'fail',
  reject: 'fail',
  rejected: 'fail',
};

/** First balanced {...} block, ignoring braces inside strings. */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function str(v: unknown, max = 400): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.toLowerCase() !== 'null' ? t.slice(0, max) : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    // "1.234 kg" (id thousands dot) / "1,234 kg" / "1234.5"
    const cleaned = v.replace(/[^\d.,-]/g, '');
    if (!cleaned) return undefined;
    let normalised = cleaned;
    if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) normalised = cleaned.replace(/[.,]/g, '');
    else normalised = cleaned.replace(',', '.');
    const n = Number(normalised);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function confidence(v: unknown): number {
  let n = num(v);
  if (n === undefined) return 0;
  if (n > 1 && n <= 100) n = n / 100;
  return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
}

const FALLBACK: ParsedAiResult = {
  verdict: 'review',
  confidence: 0,
  findings: ['The AI response could not be parsed; a human must review this evidence.'],
  extracted: {},
  summaryEn: 'The AI check result could not be read. A human will review this evidence.',
  parseOk: false,
};

/**
 * Defensive parser for the model's message content: strips <think> blocks and
 * markdown fences, extracts the first JSON object, coerces every field and
 * falls back to verdict "review" instead of throwing.
 */
export function parseAiContent(content: unknown): ParsedAiResult {
  if (typeof content !== 'string' || !content.trim()) return { ...FALLBACK };
  const cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '');
  const block = firstJsonObject(cleaned);
  if (!block) return { ...FALLBACK };
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(block) as Record<string, unknown>;
  } catch {
    try {
      // tolerate trailing commas
      obj = JSON.parse(block.replace(/,\s*([}\]])/g, '$1')) as Record<string, unknown>;
    } catch {
      return { ...FALLBACK };
    }
  }

  const rawVerdict = str(obj.verdict)?.toLowerCase() ?? '';
  const verdict = VERDICTS[rawVerdict] ?? 'review';
  const findings = (Array.isArray(obj.findings) ? obj.findings : [])
    .map((f) => str(f, 300))
    .filter((f): f is string => Boolean(f))
    .slice(0, 12);
  const ex = (typeof obj.extracted === 'object' && obj.extracted !== null
    ? obj.extracted
    : {}) as Record<string, unknown>;
  const extracted: ParsedAiResult['extracted'] = {};
  const crop = str(ex.crop, 80);
  const stage = str(ex.stage, 80);
  const kg = num(ex.kg);
  const grade = str(ex.grade, 40);
  if (crop) extracted.crop = crop;
  if (stage) extracted.stage = stage;
  if (kg !== undefined && kg >= 0) extracted.kg = kg;
  if (grade) extracted.grade = grade;

  return {
    verdict,
    confidence: confidence(obj.confidence),
    findings,
    extracted,
    summaryEn: str(obj.summary_en ?? obj.summaryEn ?? obj.summary, 600) ?? FALLBACK.summaryEn,
    parseOk: true,
  };
}
