export const PUSDC_DECIMALS = 6;

/**
 * U128 base units -> decimal string with at least 2 decimals and no lossy
 * rounding: "396900000" -> "396.90", "1" -> "0.000001", "-5000000" -> "-5.00".
 */
export function formatUnits(base: string | bigint, decimals = PUSDC_DECIMALS, minDp = 2): string {
  let v = typeof base === 'bigint' ? base : BigInt(base || '0');
  const negative = v < 0n;
  if (negative) v = -v;
  const scale = 10n ** BigInt(decimals);
  const whole = v / scale;
  let frac = (v % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  if (frac.length < minDp) frac = frac.padEnd(minDp, '0');
  return `${negative ? '-' : ''}${whole.toString()}${frac ? `.${frac}` : ''}`;
}

/** Decimal pUSDC ("12.5") -> base units string ("12500000"). Throws on bad input. */
export function parseUnits(value: string, decimals = PUSDC_DECIMALS): string {
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error('Amount must be a positive decimal number');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`Amount supports at most ${decimals} decimal places`);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')).toString();
}

export function isU128(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,39}$/.test(value);
}
