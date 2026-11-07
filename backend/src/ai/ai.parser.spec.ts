import { describe, expect, it } from 'vitest';
import { parseAiContent } from './ai.parser.js';

describe('parseAiContent', () => {
  it('parses a clean JSON object', () => {
    const r = parseAiContent(
      '{"verdict":"fail","confidence":0.9,"findings":["Indoor photo"],"extracted":{"crop":null},"summary_id":"Bukan foto sawah.","summary_en":"Not a field photo."}',
    );
    expect(r).toMatchObject({
      verdict: 'fail',
      confidence: 0.9,
      findings: ['Indoor photo'],
      extracted: {},
      summaryId: 'Bukan foto sawah.',
      summaryEn: 'Not a field photo.',
      parseOk: true,
    });
  });

  it('strips <think> blocks, fences and prose around the JSON', () => {
    const r = parseAiContent(
      '<think>The scale reads {about} 1.234</think>Here you go:\n```json\n{"verdict":"PASS","confidence":"87%","findings":[],"extracted":{"kg":"1.234 kg","grade":"A"},"summary_id":"x","summary_en":"y",}\n```',
    );
    expect(r.verdict).toBe('pass');
    expect(r.confidence).toBe(0.87);
    expect(r.extracted).toEqual({ kg: 1234, grade: 'A' });
  });

  it('maps unknown verdicts to review and clamps confidence', () => {
    const r = parseAiContent('{"verdict":"maybe","confidence":7}');
    expect(r.verdict).toBe('review');
    expect(r.confidence).toBe(0.07);
    expect(r.summaryEn).toMatch(/human/i);
  });

  it('never throws on garbage', () => {
    for (const input of [undefined, null, 42, '', 'no json', '{"verdict":', '{{{']) {
      const r = parseAiContent(input);
      expect(r.verdict).toBe('review');
      expect(r.parseOk).toBe(false);
    }
  });

  it('reads decimal kg with comma or dot', () => {
    expect(parseAiContent('{"extracted":{"kg":"912,5"}}').extracted.kg).toBe(912.5);
    expect(parseAiContent('{"extracted":{"kg":"1,000"}}').extracted.kg).toBe(1000);
    expect(parseAiContent('{"extracted":{"kg":900}}').extracted.kg).toBe(900);
  });
});
