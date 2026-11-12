import type { TxReceiptOutcome, TxStatusResult } from '../common/near/types.js';

export const EVENT_PREFIX = 'EVENT_JSON:';

export interface ParsedEvent {
  standard: string;
  version: string;
  event: string;
  /** Position among same-named events in this receipt (part of the idempotency key). */
  index: number;
  data: Record<string, unknown>;
  receiptId: string;
  executorId: string;
  blockHash: string;
  lotId: string | null;
}

export interface ParseOptions {
  /** standard -> executor accounts allowed to emit it (anti-spoofing). */
  trustedEmitters: Record<string, string[]>;
}

function receiptFailed(ro: TxReceiptOutcome): boolean {
  const status = ro.outcome.status;
  return typeof status === 'object' && status !== null && 'Failure' in status;
}

function lotIdOf(standard: string, data: Record<string, unknown>): string | null {
  if (typeof data.lot_id === 'string') return data.lot_id;
  if (standard === 'nep171' && Array.isArray(data.token_ids) && typeof data.token_ids[0] === 'string') {
    // Share NFT ids are "{lot_id}:{n}"; attribute the event to the lot.
    return data.token_ids[0].split(':')[0];
  }
  return null;
}

/** Parse one log line; null when it is not a well-formed NEP-297 event. */
export function parseEventLog(
  log: string,
): { standard: string; version: string; event: string; data: Record<string, unknown>[] } | null {
  if (!log.startsWith(EVENT_PREFIX)) return null;
  let json: unknown;
  try {
    json = JSON.parse(log.slice(EVENT_PREFIX.length).trim());
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  if (typeof o.standard !== 'string' || typeof o.event !== 'string') return null;
  const raw = o.data === undefined ? [{}] : Array.isArray(o.data) ? o.data : [o.data];
  const data = raw.filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d));
  return {
    standard: o.standard,
    version: typeof o.version === 'string' ? o.version : '',
    event: o.event,
    data,
  };
}

/**
 * Every `EVENT_JSON:` log in `receipts_outcome`, one entry per `data` item.
 * Skips failed receipts and events whose emitter is not trusted for that standard.
 */
export function parseTxEvents(tx: TxStatusResult, opts: ParseOptions): ParsedEvent[] {
  const out: ParsedEvent[] = [];
  for (const ro of tx.receipts_outcome ?? []) {
    if (receiptFailed(ro)) continue;
    const counters = new Map<string, number>();
    for (const log of ro.outcome.logs ?? []) {
      const ev = parseEventLog(log);
      if (!ev) continue;
      const trusted = opts.trustedEmitters[ev.standard];
      if (!trusted || !trusted.includes(ro.outcome.executor_id)) continue;
      for (const data of ev.data) {
        const index = counters.get(ev.event) ?? 0;
        counters.set(ev.event, index + 1);
        out.push({
          standard: ev.standard,
          version: ev.version,
          event: ev.event,
          index,
          data,
          receiptId: ro.id,
          executorId: ro.outcome.executor_id,
          blockHash: ro.block_hash,
          lotId: lotIdOf(ev.standard, data),
        });
      }
    }
  }
  return out;
}
