import { Injectable, Logger } from '@nestjs/common';
import { NearRpcService } from '../common/near/rpc.service.js';
import type { ContractStats } from '../common/near/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CACHE_MS = 30_000;
const VERIFIED = ['CoopVerified', 'Listed', 'Funded', 'Settled', 'Refunded'];
const FUNDED = ['Funded', 'Settled', 'Refunded'];

export interface StatsView extends ContractStats {
  farmers: number;
  verifiers: number;
  source: 'chain' | 'mirror';
}

/** Real counts only: get_stats from the contract, else derived from the Lot mirror. */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private cache: { at: number; value: StatsView } | null = null;

  constructor(
    private readonly rpc: NearRpcService,
    private readonly prisma: PrismaService,
  ) {}

  private async fromMirror(): Promise<ContractStats> {
    const lots = await this.prisma.lot.findMany({
      select: { status: true, actualKg: true, projectedKg: true, pricePerKg: true },
    });
    let volume = 0n;
    for (const l of lots) {
      if (l.status === 'Settled' && l.actualKg !== null) {
        volume += BigInt(Math.min(l.actualKg, l.projectedKg)) * BigInt(l.pricePerKg || '0');
      }
    }
    const farmerPaid = await this.prisma.payment.findMany({
      where: { type: 'PAYOUT', status: 'PAID' },
      select: { amountBase: true },
    });
    return {
      total_lots: lots.length,
      verified_lots: lots.filter((l) => VERIFIED.includes(l.status)).length,
      funded_lots: lots.filter((l) => FUNDED.includes(l.status)).length,
      settled_lots: lots.filter((l) => l.status === 'Settled').length,
      settled_volume: volume.toString(),
      farmer_paid: farmerPaid.reduce((a, p) => a + BigInt(p.amountBase), 0n).toString(),
    };
  }

  async get(): Promise<StatsView> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    let chain: ContractStats | null = null;
    try {
      chain = await this.rpc.getStats();
    } catch (err) {
      this.logger.debug(`get_stats unavailable: ${String(err).slice(0, 120)}`);
    }
    const base = chain ?? (await this.fromMirror());
    const farmers = await this.prisma.lot.findMany({ distinct: ['farmerId'], select: { farmerId: true } });
    let verifiers = 0;
    try {
      const lists = await Promise.all(
        (['FieldAgent', 'Coop', 'Warehouse'] as const).map((r) => this.rpc.listRole(r)),
      );
      verifiers = new Set(lists.flat()).size;
    } catch {
      verifiers = 0;
    }
    const value: StatsView = { ...base, farmers: farmers.length, verifiers, source: chain ? 'chain' : 'mirror' };
    this.cache = { at: Date.now(), value };
    return value;
  }
}
