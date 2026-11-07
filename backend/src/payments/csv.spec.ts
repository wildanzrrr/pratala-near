import { describe, expect, it } from 'vitest';
import { formatUnits, parseUnits } from '../common/money.js';
import { CSV_COLUMNS, csvDate, csvField, toCsv } from './csv.js';

describe('formatUnits (pUSDC, 6 decimals)', () => {
  it('renders the settlement reference numbers with 2 dp', () => {
    expect(formatUnits('450000000')).toBe('450.00');
    expect(formatUnits('396900000')).toBe('396.90');
    expect(formatUnits('8100000')).toBe('8.10');
    expect(formatUnits('45000000')).toBe('45.00');
  });

  it('never rounds away sub-cent base units', () => {
    expect(formatUnits('1')).toBe('0.000001');
    expect(formatUnits('1234567')).toBe('1.234567');
    expect(formatUnits('0')).toBe('0.00');
  });

  it('round-trips with parseUnits', () => {
    for (const v of ['0.45', '396.9', '12.5', '0.000001']) expect(Number(formatUnits(parseUnits(v)))).toBe(Number(v));
  });
});

describe('toCsv', () => {
  const csv = toCsv([
    {
      date_utc: csvDate(new Date('2026-11-12T08:30:00.000Z')),
      lot_id: 'lot-1',
      crop: 'Rice',
      type: 'PAYOUT',
      from_account: 'lots.pratala.testnet',
      to_account: 'farmer.pratala.testnet',
      amount_pusdc: '396.90',
      status: 'PAID',
      tx_hash: '4mVZ2hQk8hGvN3xEq9pW7cT1sYb6aR5dK2jL8nM3pQ7u',
      explorer_url: 'https://testnet.nearblocks.io/txns/4mVZ2hQk8hGvN3xEq9pW7cT1sYb6aR5dK2jL8nM3pQ7u',
      note: 'Weigh-in 900 kg grade A, "premium"',
    },
  ]);

  it('starts with a UTF-8 BOM and uses CRLF line endings', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('has exactly the INTERFACES.md columns in order', () => {
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      'date_utc,lot_id,crop,type,from_account,to_account,amount_pusdc,status,tx_hash,explorer_url,note',
    );
    expect(CSV_COLUMNS).toHaveLength(11);
  });

  it('formats a row and quotes fields containing commas or quotes', () => {
    expect(csv.split('\r\n')[1]).toBe(
      '2026-11-12 08:30:00,lot-1,Rice,PAYOUT,lots.pratala.testnet,farmer.pratala.testnet,396.90,PAID,' +
        '4mVZ2hQk8hGvN3xEq9pW7cT1sYb6aR5dK2jL8nM3pQ7u,https://testnet.nearblocks.io/txns/4mVZ2hQk8hGvN3xEq9pW7cT1sYb6aR5dK2jL8nM3pQ7u,' +
        '"Weigh-in 900 kg grade A, ""premium"""',
    );
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField(null)).toBe('');
  });
});
