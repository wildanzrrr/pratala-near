import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TxStatusResult } from '../common/near/types.js';
import { parseEventLog, parseTxEvents } from './event-parser.js';
import { notificationsFor, paymentsFor, type ProjectionContext } from './projections.js';

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')) as TxStatusResult;

const opts = {
  trustedEmitters: {
    pratala: ['lots.pratala.testnet'],
    nep171: ['lots.pratala.testnet'],
    nep141: ['pusdc.pratala.testnet'],
  },
};

const ctx: ProjectionContext = {
  txHash: 'TX',
  lotsContract: 'lots.pratala.testnet',
  farmerId: 'farmer.pratala.testnet',
  crop: 'Rice',
  treasury: 'pratala.testnet',
  lot: null,
  shares: [
    { shareId: 'lot-1:1', holder: 'buyer.pratala.testnet', kg: 700 },
    { shareId: 'lot-1:2', holder: 'investor2.pratala.testnet', kg: 300 },
  ],
  roles: { FieldAgent: ['agent.pratala.testnet'], Coop: ['coop.pratala.testnet'], Warehouse: ['warehouse.pratala.testnet'] },
};

describe('parseEventLog', () => {
  it('ignores non-event logs and malformed JSON', () => {
    expect(parseEventLog('Weigh-in recorded')).toBeNull();
    expect(parseEventLog('EVENT_JSON:{oops')).toBeNull();
    expect(parseEventLog('EVENT_JSON:{"event":"x"}')).toBeNull();
  });

  it('accepts a single data object as well as an array', () => {
    const ev = parseEventLog('EVENT_JSON:{"standard":"pratala","version":"1.0.0","event":"lot_delisted","data":{"lot_id":"lot-9"}}');
    expect(ev?.data).toEqual([{ lot_id: 'lot-9' }]);
  });
});

describe('parseTxEvents (kg purchase via pUSDC ft_transfer_call)', () => {
  const events = parseTxEvents(fixture('fund-tx.json'), opts);

  it('extracts every trusted EVENT_JSON log across receipts in order', () => {
    expect(events.map((e) => `${e.standard}:${e.event}`)).toEqual([
      'nep141:ft_transfer',
      'nep171:nft_mint',
      'pratala:lot_funded',
      'nep141:ft_transfer',
    ]);
    const funded = events[2];
    expect(funded).toMatchObject({
      lotId: 'lot-1',
      receiptId: 'RcptLots22222222222222222222222222222222222',
      executorId: 'lots.pratala.testnet',
      blockHash: 'BlkC3333333333333333333333333333333333333333',
      index: 0,
      data: { buyer: 'buyer.pratala.testnet', kg: 300, amount: '135000000', refund: '10000000', sold_kg: 300, share_id: 'lot-1:1' },
    });
    // Share NFT ids ("lot-1:1") attribute to their lot.
    expect(events[1].lotId).toBe('lot-1');
  });

  it('drops pratala events emitted by an untrusted contract (spoofing)', () => {
    expect(events.some((e) => e.executorId === 'attacker.testnet')).toBe(false);
  });

  it('derives a FUNDING payment PAID into escrow, deduped per share', () => {
    const payments = events.flatMap((e) => paymentsFor(e, ctx));
    expect(payments).toEqual([
      expect.objectContaining({
        dedupeKey: 'funding:lot-1:lot-1:1',
        type: 'FUNDING',
        fromAccount: 'buyer.pratala.testnet',
        toAccount: 'lots.pratala.testnet',
        amountBase: '135000000',
        status: 'PAID',
        note: 'Bought 300 kg (share lot-1:1); 10.00 pUSDC excess returned',
      }),
    ]);
    const inbox = events.flatMap((e) => notificationsFor(e, ctx)).map((n) => n.accountId);
    expect(inbox).toEqual(['farmer.pratala.testnet', 'buyer.pratala.testnet']);
  });
});

describe('parseTxEvents (weigh-in settlement)', () => {
  const events = parseTxEvents(fixture('settle-tx.json'), opts);

  it('skips failed receipts and unparsable logs', () => {
    expect(events.map((e) => e.event)).toEqual(['lot_attested', 'lot_settled']);
  });

  it('derives PAYOUT / FEE plus one REFUND per share with the README numbers', () => {
    const settled = events.find((e) => e.event === 'lot_settled')!;
    const rows = paymentsFor(settled, ctx).map((p) => [p.type, p.toAccount, p.amountBase, p.status]);
    expect(rows).toEqual([
      ['PAYOUT', 'farmer.pratala.testnet', '396900000', 'PENDING'],
      ['FEE', 'pratala.testnet', '8100000', 'PENDING'],
      ['REFUND', 'buyer.pratala.testnet', '31500000', 'PENDING'],
      ['REFUND', 'investor2.pratala.testnet', '13500000', 'PENDING'],
    ]);
    const notified = notificationsFor(settled, ctx).map((n) => [n.accountId, n.text.title]);
    expect(notified).toContainEqual(['buyer.pratala.testnet', 'Refund available']);
    expect(notified).toContainEqual(['investor2.pratala.testnet', 'Refund available']);
  });

  it('maps payout_claimed ok/!ok onto the same per-share ledger row', () => {
    const claim = (ok: boolean) =>
      paymentsFor(
        {
          standard: 'pratala',
          version: '1.0.0',
          event: 'payout_claimed',
          index: 0,
          data: { lot_id: 'lot-1', kind: 'Holder', to: 'collector.testnet', amount: '31500000', ok, share_id: 'lot-1:1' },
          receiptId: 'R',
          executorId: 'lots.pratala.testnet',
          blockHash: 'B',
          lotId: 'lot-1',
        },
        ctx,
      )[0];
    expect(claim(true)).toMatchObject({ dedupeKey: 'claim:lot-1:holder:lot-1:1', type: 'REFUND', status: 'PAID', toAccount: 'collector.testnet', note: 'Claimed share lot-1:1' });
    expect(claim(false)).toMatchObject({ dedupeKey: 'claim:lot-1:holder:lot-1:1', status: 'FAILED' });
  });

  it('gives each same-named event in a receipt its own index', () => {
    const tx = fixture('settle-tx.json');
    tx.receipts_outcome[0].outcome.logs.push(tx.receipts_outcome[0].outcome.logs[1]);
    const evs = parseTxEvents(tx, opts).filter((e) => e.event === 'lot_attested');
    expect(evs.map((e) => e.index)).toEqual([0, 1]);
  });
});
