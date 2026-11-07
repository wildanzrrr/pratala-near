import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '../config/app-config.service.js';
import { formatUnits } from '../common/money.js';
import type { Payment, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { csvDate, toCsv, type CsvRow } from './csv.js';

const date = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Expected an ISO date (YYYY-MM-DD)')
  .transform((v) => new Date(v));

export const paymentsQuerySchema = z.object({
  account: z.string().trim().max(64).optional(),
  lotId: z.string().trim().max(32).optional(),
  from: date.optional(),
  /** Inclusive: a bare date means the whole day. */
  to: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Expected an ISO date (YYYY-MM-DD)')
    .transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(Date.parse(v) + 86_400_000 - 1) : new Date(v)))
    .optional(),
});
export type PaymentsQuery = z.infer<typeof paymentsQuerySchema>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private async rows(q: PaymentsQuery): Promise<Payment[]> {
    const where: Prisma.PaymentWhereInput = {
      ...(q.account ? { OR: [{ fromAccount: q.account }, { toAccount: q.account }] } : {}),
      ...(q.lotId ? { lotId: q.lotId } : {}),
      ...(q.from || q.to
        ? { occurredAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
        : {}),
    };
    return this.prisma.payment.findMany({ where, orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }], take: 5_000 });
  }

  toView(p: Payment) {
    return {
      id: p.id,
      lotId: p.lotId,
      orderId: p.orderId,
      type: p.type,
      fromAccount: p.fromAccount,
      toAccount: p.toAccount,
      amount: formatUnits(p.amountBase),
      amountBase: p.amountBase,
      status: p.status,
      txHash: p.txHash,
      explorerUrl: this.config.explorerTxUrl(p.txHash),
      note: p.note,
      occurredAt: p.occurredAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    };
  }

  async list(q: PaymentsQuery) {
    return (await this.rows(q)).map((p) => this.toView(p));
  }

  async csv(q: PaymentsQuery): Promise<string> {
    const payments = await this.rows(q);
    const lotIds = [...new Set(payments.map((p) => p.lotId).filter((x): x is string => Boolean(x)))];
    const lots = lotIds.length
      ? await this.prisma.lot.findMany({ where: { lotId: { in: lotIds } }, select: { lotId: true, crop: true } })
      : [];
    const crops = new Map(lots.map((l) => [l.lotId, l.crop]));
    const rows: CsvRow[] = payments.map((p) => ({
      date_utc: csvDate(p.occurredAt),
      lot_id: p.lotId ?? '',
      crop: p.lotId ? (crops.get(p.lotId) ?? '') : '',
      type: p.type,
      from_account: p.fromAccount,
      to_account: p.toAccount,
      amount_pusdc: formatUnits(p.amountBase),
      status: p.status,
      tx_hash: p.txHash ?? '',
      explorer_url: this.config.explorerTxUrl(p.txHash) ?? '',
      note: p.note ?? '',
    }));
    return toCsv(rows);
  }
}
