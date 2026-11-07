import type { PaymentStatus, PaymentType } from '../generated/prisma/client.js';
import { formatUnits, isU128 } from '../common/money.js';
import type { NotifyInput } from '../notifications/notifications.service.js';
import type { ParsedEvent } from './event-parser.js';

/** Context the projection needs that is not inside the event itself. */
export interface ProjectionContext {
  txHash: string;
  lotsContract: string;
  farmerId: string | null;
  holder: string | null;
  crop: string | null;
  treasury: string;
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

/**
 * Payment ledger rows implied by one event (docs/PAYMENTS.md):
 * lot_funded -> FUNDING PAID; lot_settled -> PAYOUT/FEE/REFUND PENDING;
 * lot_refunded -> REFUND PENDING; payout_claimed -> PAID (ok) / FAILED (!ok).
 */
export function paymentsFor(ev: ParsedEvent, ctx: ProjectionContext): PaymentWrite[] {
  if (ev.standard !== 'pratala' || !ev.lotId) return [];
  const lotId = ev.lotId;
  const d = ev.data;
  switch (ev.event) {
    case 'lot_funded': {
      const funder = s(d.funder);
      if (!funder || !positive(d.amount)) return [];
      const refund = positive(d.refund) ? formatUnits(d.refund) : null;
      return [
        {
          dedupeKey: `funding:${lotId}:${ctx.txHash}`,
          lotId,
          type: 'FUNDING',
          fromAccount: funder,
          toAccount: ctx.lotsContract,
          amountBase: d.amount,
          status: 'PAID',
          txHash: ctx.txHash,
          note: refund ? `Escrow deposit; ${refund} pUSDC excess returned to funder` : 'Escrow deposit',
        },
      ];
    }
    case 'lot_settled': {
      const rows: PaymentWrite[] = [];
      const note = `Weigh-in ${txt(d.actual_kg, '?')} kg${txt(d.grade) ? ` grade ${txt(d.grade)}` : ''}`;
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
      add('farmer', 'PAYOUT', ctx.farmerId, d.farmer_claim);
      add('treasury', 'FEE', ctx.treasury, d.fee);
      add('holder', 'REFUND', ctx.holder, d.holder_claim);
      return rows;
    }
    case 'lot_refunded': {
      if (!ctx.holder || !positive(d.holder_claim)) return [];
      return [
        {
          dedupeKey: `claim:${lotId}:holder`,
          lotId,
          type: 'REFUND',
          fromAccount: ctx.lotsContract,
          toAccount: ctx.holder,
          amountBase: d.holder_claim,
          status: 'PENDING',
          txHash: null,
          note: `Crop failure refund${txt(d.reason) ? `: ${txt(d.reason).slice(0, 120)}` : ''}; claimable`,
          createOnly: true,
        },
      ];
    }
    case 'payout_claimed': {
      const kind = CLAIM_TYPE[txt(d.kind)];
      const to = s(d.to);
      if (!kind || !to || !positive(d.amount)) return [];
      const ok = d.ok === true;
      return [
        {
          dedupeKey: `claim:${lotId}:${kind.key}`,
          lotId,
          type: kind.type,
          fromAccount: ctx.lotsContract,
          toAccount: to,
          amountBase: d.amount,
          status: ok ? 'PAID' : 'FAILED',
          txHash: ctx.txHash,
          note: ok ? 'Claimed' : 'Transfer failed (receiver not registered?); claim restored on-chain, retry',
        },
      ];
    }
    default:
      return [];
  }
}

type Copy = NotifyInput['text'];
const t = (idTitle: string, idBody: string, enTitle: string, enBody: string): Copy => ({
  id: { title: idTitle, body: idBody },
  en: { title: enTitle, body: enBody },
});

export interface NotificationWrite {
  accountId: string;
  type: string;
  text: Copy;
}

/** Inbox rows for farmer / holder / verifiers implied by one event. */
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
      to([farmer], t('Lot terdaftar', `${lot} (${crop}) sudah tercatat. Tunggu kunjungan petugas lapangan.`, 'Lot registered', `${lot} (${crop}) is on-chain. A field agent will visit next.`));
      to(ctx.roles.FieldAgent, t('Lot baru perlu dicek', `${lot} (${crop}) menunggu kunjungan lapangan.`, 'New lot to verify', `${lot} (${crop}) is waiting for a field visit.`));
      break;
    case 'lot_attested': {
      const kind = txt(d.kind);
      to([farmer], t('Verifikasi ditambahkan', `${lot}: ${kind} oleh ${txt(d.signer)}.`, 'Verification added', `${lot}: ${kind} by ${txt(d.signer)}.`));
      if (kind === 'FieldVisit') {
        to(ctx.roles.Coop, t('Perlu tinjauan koperasi', `${lot} sudah dicek lapangan dan menunggu tinjauan koperasi.`, 'Co-op review needed', `${lot} passed the field visit and awaits co-op review.`));
      }
      break;
    }
    case 'lot_listed':
      to([farmer], t('Lot tampil di pasar', `${lot} terbuka untuk pendanaan: ${amt(d.total)} pUSDC.`, 'Lot listed', `${lot} is open for funding: ${amt(d.total)} pUSDC.`));
      break;
    case 'lot_delisted':
    case 'lot_cancelled':
      to([farmer], t('Status lot berubah', `${lot}: ${ev.event === 'lot_cancelled' ? 'dibatalkan' : 'ditarik dari pasar'}.`, 'Lot status changed', `${lot}: ${ev.event === 'lot_cancelled' ? 'cancelled' : 'delisted'}.`));
      break;
    case 'lot_funded':
      to([farmer], t('Lot didanai', `${lot} didanai ${amt(d.amount)} pUSDC. Dana aman di escrow sampai timbang di gudang.`, 'Lot funded', `${lot} was funded with ${amt(d.amount)} pUSDC, held in escrow until the warehouse weigh-in.`));
      to([s(d.funder)], t('Pendanaan berhasil', `Anda mendanai ${lot}. NFT lot sekarang milik Anda.`, 'Funding confirmed', `You funded ${lot}. The lot NFT is now yours.`));
      to(ctx.roles.Warehouse, t('Menunggu timbang', `${lot} (${crop}) sudah didanai dan menunggu timbang.`, 'Awaiting weigh-in', `${lot} (${crop}) is funded and awaits weigh-in.`));
      break;
    case 'lot_settled':
      to([farmer], t('Panen ditimbang', `${lot}: ${txt(d.actual_kg, '?')} kg. Anda bisa klaim ${amt(d.farmer_claim)} pUSDC.`, 'Harvest settled', `${lot}: ${txt(d.actual_kg, '?')} kg. You can claim ${amt(d.farmer_claim)} pUSDC.`));
      if (isU128(d.holder_claim) && BigInt(d.holder_claim) > 0n) {
        to([ctx.holder], t('Pengembalian tersedia', `${lot}: Anda bisa klaim ${amt(d.holder_claim)} pUSDC.`, 'Refund available', `${lot}: you can claim ${amt(d.holder_claim)} pUSDC.`));
      }
      break;
    case 'lot_refunded':
      to([ctx.holder], t('Dana dikembalikan', `${lot} gagal panen. Klaim ${amt(d.holder_claim)} pUSDC.`, 'Lot refunded', `${lot} was declared a crop failure. Claim ${amt(d.holder_claim)} pUSDC.`));
      to([farmer], t('Gagal panen dicatat', `${lot} dinyatakan gagal panen.`, 'Crop failure recorded', `${lot} was declared a crop failure.`));
      break;
    case 'payout_claimed':
      to([s(d.to)], d.ok === true
        ? t('Pembayaran diterima', `${amt(d.amount)} pUSDC dari ${lot} masuk ke akun Anda.`, 'Payment received', `${amt(d.amount)} pUSDC from ${lot} arrived in your account.`)
        : t('Pembayaran gagal', `Transfer ${amt(d.amount)} pUSDC dari ${lot} gagal. Daftarkan akun di pUSDC lalu klaim lagi.`, 'Payment failed', `The ${amt(d.amount)} pUSDC transfer from ${lot} failed. Register with pUSDC and claim again.`));
      break;
    default:
      break;
  }
  return out;
}
