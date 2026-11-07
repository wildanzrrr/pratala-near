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
  holder: 'buyer.pratala.testnet',
  crop: 'Rice',
  treasury: 'pratala.testnet',
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

describe('parseTxEvents (funding tx via pUSDC ft_transfer_call)', () => {
  const events = parseTxEvents(fixture('fund-tx.json'), opts);

  it('extracts every trusted EVENT_JSON log across receipts in order', () => {
    expect(events.map((e) => `${e.standard}:${e.event}`)).toEqual([
      'nep141:ft_transfer',
      'nep171:nft_transfer',
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
      data: { funder: 'buyer.pratala.testnet', amount: '450000000', refund: '10000000' },
    });
    expect(events[1].lotId).toBe('lot-1'); // nep171 token_ids[0]
  });

  it('drops pratala events emitted by an untrusted contract (spoofing)', () => {
    expect(events.some((e) => e.executorId === 'attacker.testnet')).toBe(false);
  });

  it('derives a FUNDING payment PAID into escrow', () => {
    const payments = events.flatMap((e) => paymentsFor(e, ctx));
    expect(payments).toEqual([
      expect.objectContaining({
        dedupeKey: 'funding:lot-1:TX',
        type: 'FUNDING',
        fromAccount: 'buyer.pratala.testnet',
        toAccount: 'lots.pratala.testnet',
        amountBase: '450000000',
        status: 'PAID',
        note: 'Escrow deposit; 10.00 pUSDC excess returned to funder',
      }),
    ]);
    const inbox = events.flatMap((e) => notificationsFor(e, ctx)).map((n) => n.accountId);
    expect(inbox).toEqual(['farmer.pratala.testnet', 'buyer.pratala.testnet', 'warehouse.pratala.testnet']);
  });
});

describe('parseTxEvents (weigh-in settlement)', () => {
  const events = parseTxEvents(fixture('settle-tx.json'), opts);

  it('skips failed receipts and unparsable logs', () => {
    expect(events.map((e) => e.event)).toEqual(['lot_attested', 'lot_settled']);
  });

  it('derives PAYOUT / FEE / REFUND claims PENDING with the README numbers', () => {
    const settled = events.find((e) => e.event === 'lot_settled')!;
    const rows = paymentsFor(settled, ctx).map((p) => [p.type, p.toAccount, p.amountBase, p.status]);
    expect(rows).toEqual([
      ['PAYOUT', 'farmer.pratala.testnet', '396900000', 'PENDING'],
      ['FEE', 'pratala.testnet', '8100000', 'PENDING'],
      ['REFUND', 'buyer.pratala.testnet', '45000000', 'PENDING'],
    ]);
  });

  it('maps payout_claimed ok/!ok onto the same ledger row', () => {
    const claim = (ok: boolean) =>
      paymentsFor(
        {
          standard: 'pratala',
          version: '1.0.0',
          event: 'payout_claimed',
          index: 0,
          data: { lot_id: 'lot-1', kind: 'Holder', to: 'collector.testnet', amount: '45000000', ok },
          receiptId: 'R',
          executorId: 'lots.pratala.testnet',
          blockHash: 'B',
          lotId: 'lot-1',
        },
        ctx,
      )[0];
    expect(claim(true)).toMatchObject({ dedupeKey: 'claim:lot-1:holder', type: 'REFUND', status: 'PAID', toAccount: 'collector.testnet' });
    expect(claim(false)).toMatchObject({ dedupeKey: 'claim:lot-1:holder', status: 'FAILED' });
  });

  it('gives each same-named event in a receipt its own index', () => {
    const tx = fixture('settle-tx.json');
    tx.receipts_outcome[0].outcome.logs.push(tx.receipts_outcome[0].outcome.logs[1]);
    const evs = parseTxEvents(tx, opts).filter((e) => e.event === 'lot_attested');
    expect(evs.map((e) => e.index)).toEqual([0, 1]);
  });
});
