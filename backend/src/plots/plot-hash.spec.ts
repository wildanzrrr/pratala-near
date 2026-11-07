import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalPlotJson, coord5, gpsHash, plotHash } from './plot-hash.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const base = { farmer: 'farmer.pratala.testnet', lat: -6.914751, lng: 107.609812, areaM2: 1200, evidenceSha256: [B, A] };

describe('plotHash / gpsHash', () => {
  it('builds canonical JSON with sorted keys, 5-dp coordinates and sorted evidence', () => {
    expect(canonicalPlotJson(base)).toBe(
      `{"areaM2":1200,"evidence":["${A}","${B}"],"farmer":"farmer.pratala.testnet","lat":"-6.91475","lng":"107.60981"}`,
    );
  });

  it('is deterministic regardless of evidence order, duplicates or case', () => {
    const h = plotHash(base);
    expect(plotHash({ ...base, evidenceSha256: [A, B] })).toBe(h);
    expect(plotHash({ ...base, evidenceSha256: [A.toUpperCase(), B, B] })).toBe(h);
    expect(plotHash({ ...base, lat: -6.9147512 })).toBe(h); // below 5 dp
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when any committed field changes', () => {
    const h = plotHash(base);
    expect(plotHash({ ...base, farmer: 'other.testnet' })).not.toBe(h);
    expect(plotHash({ ...base, lat: -6.91476 })).not.toBe(h);
    expect(plotHash({ ...base, areaM2: 1201 })).not.toBe(h);
    expect(plotHash({ ...base, evidenceSha256: [A] })).not.toBe(h);
  });

  it('gpsHash = sha256("lat,lng") at 5 dp', () => {
    const expected = createHash('sha256').update('-6.91475,107.60981').digest('hex');
    expect(gpsHash(-6.914751, 107.609812)).toBe(expected);
    expect(coord5(-0.000001)).toBe('0.00000');
    expect(() => coord5(Number.NaN)).toThrow();
  });
});
