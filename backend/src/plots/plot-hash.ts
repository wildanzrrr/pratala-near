import { createHash } from 'node:crypto';

/** Fixed 5-decimal string (≈ 1.1 m), normalising -0 to 0. */
export function coord5(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Coordinate must be finite');
  const s = value.toFixed(5);
  return s === '-0.00000' ? '0.00000' : s;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** gpsHash = sha256("<lat>,<lng>") with both coordinates at 5 dp. */
export function gpsHash(lat: number, lng: number): string {
  return sha256(`${coord5(lat)},${coord5(lng)}`);
}

export interface PlotHashInput {
  farmer: string;
  lat: number;
  lng: number;
  areaM2: number;
  evidenceSha256: string[];
}

/**
 * Canonical JSON (keys sorted, coordinates as 5-dp strings, evidence digests
 * lower-cased + sorted + de-duplicated, no whitespace), e.g.
 * {"areaM2":1200,"evidence":["ab…"],"farmer":"farmer.testnet","lat":"-6.91475","lng":"107.60981"}
 */
export function canonicalPlotJson(input: PlotHashInput): string {
  const evidence = [...new Set(input.evidenceSha256.map((s) => s.toLowerCase()))].sort();
  return JSON.stringify({
    areaM2: Math.round(input.areaM2),
    evidence,
    farmer: input.farmer,
    lat: coord5(input.lat),
    lng: coord5(input.lng),
  });
}

/** plotHash = sha256(canonicalPlotJson(...)). */
export function plotHash(input: PlotHashInput): string {
  return sha256(canonicalPlotJson(input));
}
