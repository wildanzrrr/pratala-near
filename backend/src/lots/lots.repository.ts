import { Injectable } from '@nestjs/common';
import type { Lot, Prisma } from '../generated/prisma/client.js';
import type { LotView } from '../common/near/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

function big(v: number | null | undefined): bigint | null {
  return v === null || v === undefined ? null : BigInt(Math.trunc(v));
}

/** Lot mirror table: LotView JSON from the chain + indexed columns for filters. */
@Injectable()
export class LotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(view: LotView): Promise<void> {
    const data = {
      farmerId: view.farmer_id,
      crop: view.crop,
      variety: view.variety,
      region: view.region,
      status: view.status,
      projectedKg: view.projected_kg,
      soldKg: view.sold_kg ?? 0,
      remainingKg: view.remaining_kg ?? view.projected_kg,
      shareCount: view.share_count ?? 0,
      harvestMonth: view.harvest_month,
      plotHash: view.plot_hash,
      gpsHash: view.gps_hash,
      areaM2: view.area_m2,
      pricePerKg: view.price_per_kg,
      fundingTotal: view.funding_total,
      escrow: view.escrow,
      fundedAtMs: big(view.funded_at_ms),
      actualKg: view.actual_kg,
      grade: view.grade,
      settledAtMs: big(view.settled_at_ms),
      claims: view.claims as unknown as Prisma.InputJsonValue,
      claimLock: view.claim_lock,
      attestations: view.attestations as unknown as Prisma.InputJsonValue,
      createdAtMs: BigInt(Math.trunc(view.created_at_ms ?? 0)),
      raw: view as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    };
    await this.prisma.lot.upsert({
      where: { lotId: view.lot_id },
      create: { lotId: view.lot_id, ...data },
      update: data,
    });
  }

  find(lotId: string): Promise<Lot | null> {
    return this.prisma.lot.findUnique({ where: { lotId } });
  }

  findMany(where: Prisma.LotWhereInput): Promise<Lot[]> {
    return this.prisma.lot.findMany({ where, orderBy: { createdAtMs: 'desc' }, take: 500 });
  }

  count(): Promise<number> {
    return this.prisma.lot.count();
  }

  static toView(lot: Lot): LotView {
    return lot.raw as unknown as LotView;
  }
}
