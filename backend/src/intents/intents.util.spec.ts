import { describe, expect, it } from 'vitest';
import { decimalToBaseUnits, validateQuoteBody } from './intents.util.js';

describe('decimalToBaseUnits (verbatim port)', () => {
  it('converts decimals exactly with BigInt', () => {
    expect(decimalToBaseUnits('450', 6)).toBe('450000000');
    expect(decimalToBaseUnits('0.45', 6)).toBe('450000');
    expect(decimalToBaseUnits('1.5', 18)).toBe('1500000000000000000');
    expect(decimalToBaseUnits('123456789012345678901234567890.123456', 6)).toBe('123456789012345678901234567890123456');
    expect(decimalToBaseUnits(' 7 ', 0)).toBe('7');
  });

  it('rejects malformed amounts', () => {
    for (const bad of ['', 'abc', '-1', '1e6', '01', '.5', '1.', '1,5', null, undefined]) {
      expect(() => decimalToBaseUnits(bad, 6)).toThrow('Amount must be a positive decimal number');
    }
  });

  it('rejects zero, too many decimals and bad token decimals', () => {
    expect(() => decimalToBaseUnits('0', 6)).toThrow('greater than zero');
    expect(() => decimalToBaseUnits('0.000', 6)).toThrow('greater than zero');
    expect(() => decimalToBaseUnits('1.1234567', 6)).toThrow('at most 6 decimal places');
    expect(() => decimalToBaseUnits('1', 37)).toThrow('Unsupported token decimals');
    expect(() => decimalToBaseUnits('1', 1.5)).toThrow('Unsupported token decimals');
  });
});

describe('validateQuoteBody', () => {
  const ok = {
    originAsset: 'nep141:a',
    destinationAsset: 'nep141:b',
    amount: '10',
    recipient: 'buyer.near',
    refundTo: '0x1234567890abcdef',
  };

  it('defaults dry to true and slippage to 100 bps', () => {
    expect(validateQuoteBody(ok)).toEqual({ body: { ...ok, slippageTolerance: 100, dry: true } });
    expect(validateQuoteBody({ ...ok, dry: false })).toMatchObject({ body: { dry: false } });
  });

  it('returns the prototype error messages', () => {
    expect(validateQuoteBody({})).toEqual({ error: 'Missing required quote fields' });
    expect(validateQuoteBody({ ...ok, recipient: 'short' })).toEqual({
      error: 'Recipient and refund addresses must be valid non-empty addresses',
    });
    expect(validateQuoteBody({ ...ok, slippageTolerance: 9999 })).toEqual({
      error: 'Slippage tolerance must be an integer from 1 to 5000 bps',
    });
  });
});
