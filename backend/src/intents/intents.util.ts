// Ported verbatim from the pratala-web3 prototype (server.mjs, Oct 2026).

export function decimalToBaseUnits(value: unknown, decimals: number): string {
  // oxlint-disable-next-line typescript/no-base-to-string -- verbatim port; the regex rejects "[object Object]"
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error('Amount must be a positive decimal number');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Unsupported token decimals');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`Amount supports at most ${decimals} decimal places`);
  const scale = 10n ** BigInt(decimals);
  const fractionalUnits = fraction ? BigInt(fraction.padEnd(decimals, '0')) : 0n;
  const units = BigInt(whole) * scale + fractionalUnits;
  if (units <= 0n) throw new Error('Amount must be greater than zero');
  return units.toString();
}

export function validAddress(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 8 && value.trim().length <= 128 && !/\s/.test(value);
}

export interface QuoteBody {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  slippageTolerance: number;
  dry: boolean;
}

/** Prototype validation (no network). Returns an error message or the normalised body. */
export function validateQuoteBody(input: unknown): { error: string } | { body: QuoteBody } {
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const required = ['originAsset', 'destinationAsset', 'amount', 'recipient', 'refundTo'];
  if (required.some((key) => typeof body[key] !== 'string' || !body[key].trim())) {
    return { error: 'Missing required quote fields' };
  }
  if (!validAddress(body.recipient) || !validAddress(body.refundTo)) {
    return { error: 'Recipient and refund addresses must be valid non-empty addresses' };
  }
  const slippageTolerance = body.slippageTolerance === undefined ? 100 : Number(body.slippageTolerance);
  if (!Number.isInteger(slippageTolerance) || slippageTolerance < 1 || slippageTolerance > 5000) {
    return { error: 'Slippage tolerance must be an integer from 1 to 5000 bps' };
  }
  if (body.dry !== undefined && typeof body.dry !== 'boolean') {
    return { error: 'dry must be a boolean' };
  }
  return {
    body: {
      originAsset: (body.originAsset as string).trim(),
      destinationAsset: (body.destinationAsset as string).trim(),
      amount: body.amount as string,
      recipient: (body.recipient as string).trim(),
      refundTo: (body.refundTo as string).trim(),
      slippageTolerance,
      // Demo default: preview quotes only (no deposit address). 1Click is mainnet-only.
      dry: body.dry !== false,
    },
  };
}
