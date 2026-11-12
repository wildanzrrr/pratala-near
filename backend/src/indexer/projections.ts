import type { PaymentStatus, PaymentType } from '../generated/prisma/client.js';
import type { LotView } from '../common/near/types.js';
import { formatUnits, isU128 } from '../common/money.js';
import type { NotifyInput } from '../notifications/notifications.service.js';
import type { ParsedEvent } from './event-parser.js';

/** Mirror row of one share NFT, as needed by the projections. */
export interface ShareRow {
  shareId: string;
  holder: string;
  kg: number;
}

/** Context the projection needs that is not inside the event itself. */
export interface ProjectionContext {
  txHash: string;
  lotsContract: string;
  farmerId: string | null;
  crop: string | null;
  /** Configured treasury; null when the contract is unreachable — fee rows are skipped. */
  treasury: string | null;
  /** Chain snapshot of the lot right after the event (null when unreachable). */
  lot: LotView | null;
  /** The lot's share NFTs in mint order (mirror). */
  shares: ShareRow[];
  roles: { FieldAgent: string[]; Coop: string[]; Warehouse: string[] };
}

export interface PaymentWrite {
  dedupeKey: string;
  lotId: string | null;
  type: PaymentType;
  fromAccount: string;
  toAccount: string;
  amountBase: string;
  status: PaymentStatus;
  txHash: string | null;
  note: string | null;
  /** When true the row is created if missing but an existing row is left as is. */
  createOnly?: boolean;
}

const CLAIM_TYPE: Record<string, { type: PaymentType; key: string }> = {
  Farmer: { type: 'PAYOUT', key: 'farmer' },
  Holder: { type: 'REFUND', key: 'holder' },
  Treasury: { type: 'FEE', key: 'treasury' },
};

const positive = (v: unknown): v is string => isU128(v) && BigInt(v) > 0n;
const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** Printable scalar for notes/copy (objects never stringify to [object Object]). */
const txt = (v: unknown, fallback = ''): string =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : fallback;

/** A share's refund entitlement: floor(pool × kg / sold_kg), the contract's exact expression. */
export function shareEntitlement(pool: bigint, kg: number, soldKg: number): bigint {
  return soldKg > 0 ? (pool * BigInt(kg)) / BigInt(soldKg) : 0n;
}

/** Refund pool + sold kg for a settle/refund event, preferring the event data over the snapshot. */
function poolOf(ev: ParsedEvent, ctx: ProjectionContext): { pool: bigint; soldKg: number } | null {
  const pool = isU128(ev.data.holder_pool)
    ? BigInt(ev.data.holder_pool)
    : ctx.lot && isU128(ctx.lot.holder_pool)
      ? BigInt(ctx.lot.holder_pool)
      : null;
  const soldKg =
    typeof ev.data.sold_kg === 'number' && ev.data.sold_kg > 0
      ? ev.data.sold_kg
      : (ctx.lot?.sold_kg ?? 0);
  if (pool === null || soldKg <= 0) return null;
  return { pool, soldKg };
}

/**
 * Payment ledger rows implied by one event (docs/PAYMENTS.md):
 * lot_funded -> FUNDING PAID per purchase; lot_settled -> PAYOUT/FEE PENDING plus one REFUND
 * PENDING per share NFT; lot_refunded -> per-share REFUND PENDING; payout_claimed -> PAID (ok)
 * / FAILED (!ok).
 */
export function paymentsFor(ev: ParsedEvent, ctx: ProjectionContext): PaymentWrite[] {
  if (ev.standard !== 'pratala' || !ev.lotId) return [];
  const lotId = ev.lotId;
  const d = ev.data;
  switch (ev.event) {
    case 'lot_funded': {
      const buyer = s(d.buyer);
      const shareId = s(d.share_id);
      if (!buyer || !shareId || !positive(d.amount)) return [];
      const refund = positive(d.refund) ? formatUnits(d.refund) : null;
      return [
        {
          dedupeKey: `funding:${lotId}:${shareId}`,
          lotId,
          type: 'FUNDING',
          fromAccount: buyer,
          toAccount: ctx.lotsContract,
          amountBase: d.amount,
          status: 'PAID',
          txHash: ctx.txHash,
          note: refund
            ? `Bought ${txt(d.kg, '?')} kg (share ${shareId}); ${refund} pUSDC excess returned`
            : `Bought ${txt(d.kg, '?')} kg (share ${shareId})`,
        },
      ];
    }
    case 'lot_settled':
    case 'lot_refunded': {
      const split = poolOf(ev, ctx);
      if (!split) return [];
      const settled = ev.event === 'lot_settled';
      const note = settled
        ? `Weigh-in ${txt(d.actual_kg, '?')} kg${txt(d.grade) ? ` grade ${txt(d.grade)}` : ''}`
        : `Crop failure${txt(d.reason) ? `: ${txt(d.reason).slice(0, 120)}` : ''}`;
      const rows: PaymentWrite[] = [];
      const add = (key: string, type: PaymentType, to: string | null, amount: unknown) => {
        if (!to || !positive(amount)) return;
        rows.push({
          dedupeKey: `claim:${lotId}:${key}`,
          lotId,
          type,
          fromAccount: ctx.lotsContract,
          toAccount: to,
          amountBase: amount,
          status: 'PENDING',
          txHash: null,
          note: `${note}; claimable`,
          createOnly: true,
        });
      };
      if (settled) {
        add('farmer', 'PAYOUT', ctx.farmerId, d.farmer_claim);
        add('treasury', 'FEE', ctx.treasury, d.fee);
      }
      for (const share of ctx.shares) {
        add(
          `holder:${share.shareId}`,
          'REFUND',
          share.holder,
          shareEntitlement(split.pool, share.kg, split.soldKg).toString(),
        );
      }
      return rows;
    }
    case 'payout_claimed': {
      const kind = CLAIM_TYPE[txt(d.kind)];
      const to = s(d.to);
      if (!kind || !to || !positive(d.amount)) return [];
      const shareId = s(d.share_id);
      const ok = d.ok === true;
      return [
        {
          dedupeKey: `claim:${lotId}:${kind.key}${shareId ? `:${shareId}` : ''}`,
          lotId,
          type: kind.type,
          fromAccount: ctx.lotsContract,
          toAccount: to,
          amountBase: d.amount,
          status: ok ? 'PAID' : 'FAILED',
          txHash: ctx.txHash,
          note: ok
            ? shareId
              ? `Claimed share ${shareId}`
              : 'Claimed'
            : 'Transfer failed (receiver not registered?); claim restored on-chain, retry',
        },
      ];
    }
    default:
      return [];
  }
}

type Copy = NotifyInput['text'];
const t = (title: string, body: string): Copy => ({ title, body });

export interface NotificationWrite {
  accountId: string;
  type: string;
  text: Copy;
}

/** Inbox rows for farmer / share holders / verifiers implied by one event. */
export function notificationsFor(ev: ParsedEvent, ctx: ProjectionContext): NotificationWrite[] {
  if (ev.standard !== 'pratala' || !ev.lotId) return [];
  const lot = ev.lotId;
  const d = ev.data;
  const crop = ctx.crop ?? s(d.crop) ?? 'harvest';
  const farmer = ctx.farmerId ?? s(d.farmer_id);
  const out: NotificationWrite[] = [];
  const to = (accounts: (string | null | undefined)[], text: Copy) => {
    for (const a of new Set(accounts.filter((x): x is string => Boolean(x)))) {
      out.push({ accountId: a, type: ev.event, text });
    }
  };
  const amt = (v: unknown) => (isU128(v) ? formatUnits(v) : '?');

  switch (ev.event) {
    case 'lot_registered':
      to([farmer], t('Lot registered', `${lot} (${crop}) is on-chain. A field agent will visit next.`));
      to(ctx.roles.FieldAgent, t('New lot to verify', `${lot} (${crop}) is waiting for a field visit.`));
      break;
    case 'lot_attested': {
      const kind = txt(d.kind);
      to([farmer], t('Verification added', `${lot}: ${kind} by ${txt(d.signer)}.`));
      if (kind === 'FieldVisit') {
        to(ctx.roles.Coop, t('Co-op review needed', `${lot} passed the field visit and awaits co-op review.`));
      }
      break;
    }
    case 'lot_listed':
      to([farmer], t('Lot listed', `${lot} is open for kg purchases at ${amt(d.price_per_kg ?? d.total)} pUSDC per kg.`));
      break;
    case 'lot_delisted':
    case 'lot_cancelled':
      to([farmer], t('Lot status changed', `${lot}: ${ev.event === 'lot_cancelled' ? 'cancelled' : 'delisted'}.`));
      break;
    case 'lot_funded':
      to([farmer], t('Kg sold', `${lot}: ${txt(d.kg, '?')} kg sold to ${txt(d.buyer)} (${amt(d.amount)} pUSDC added to escrow).`));
      to([s(d.buyer)], t('Purchase confirmed', `You bought ${txt(d.kg, '?')} kg of ${lot}. Share NFT ${txt(d.share_id)} is yours; it carries your escrow refund claim.`));
      break;
    case 'lot_funding_closed':
      to([farmer], t('Funding closed', `${lot}: ${txt(d.sold_kg, '?')} of ${txt(d.projected_kg, '?')} kg sold. Escrow is final and the warehouse can weigh in.`));
      to(ctx.roles.Warehouse, t('Awaiting weigh-in', `${lot} (${crop}) closed funding and awaits weigh-in.`));
      break;
    case 'lot_settled': {
      to([farmer], t('Harvest settled', `${lot}: ${txt(d.actual_kg, '?')} kg. You can claim ${amt(d.farmer_claim)} pUSDC.`));
      const split = poolOf(ev, ctx);
      if (split && split.pool > 0n) {
        // One notice per account, summing that account's shares.
        const byHolder = new Map<string, { kg: number; amount: bigint }>();
        for (const share of ctx.shares) {
          const e = shareEntitlement(split.pool, share.kg, split.soldKg);
          const cur = byHolder.get(share.holder) ?? { kg: 0, amount: 0n };
          byHolder.set(share.holder, { kg: cur.kg + share.kg, amount: cur.amount + e });
        }
        for (const [holder, v] of byHolder) {
          if (v.amount > 0n) {
            to([holder], t('Refund available', `${lot}: your ${v.kg} kg of shares can claim ${formatUnits(v.amount.toString())} pUSDC.`));
          }
        }
      }
      break;
    }
    case 'lot_refunded': {
      const split = poolOf(ev, ctx);
      if (split) {
        for (const share of ctx.shares) {
          const e = shareEntitlement(split.pool, share.kg, split.soldKg);
          if (e > 0n) {
            to([share.holder], t('Lot refunded', `${lot} was declared a crop failure. Share ${share.shareId} (${share.kg} kg) can claim ${formatUnits(e.toString())} pUSDC.`));
          }
        }
      }
      to([farmer], t('Crop failure recorded', `${lot} was declared a crop failure.`));
      break;
    }
    case 'payout_claimed':
      to([s(d.to)], d.ok === true
        ? t('Payment received', `${amt(d.amount)} pUSDC from ${lot} arrived in your account.`)
        : t('Payment failed', `The ${amt(d.amount)} pUSDC transfer from ${lot} failed. Register with pUSDC and claim again.`));
      break;
    default:
      break;
  }
  return out;
}
