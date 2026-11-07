import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { AppConfig } from '../config/app-config.service.js';
import { NearRpcService } from '../common/near/rpc.service.js';
import type { LotView } from '../common/near/types.js';
import { formatUnits } from '../common/money.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LotsRepository } from './lots.repository.js';
import type { LotsQuery } from './lots.schemas.js';

function matches(lot: LotView, q: LotsQuery): boolean {
  const ci = (a: string | null | undefined, b: string) => (a ?? '').toLowerCase().includes(b.toLowerCase());
  if (q.status && lot.status !== q.status) return false;
  if (q.crop && !ci(lot.crop, q.crop)) return false;
  if (q.region && !ci(lot.region, q.region)) return false;
  if (q.holder && lot.holder !== q.holder) return false;
  if (q.farmer && lot.farmer_id !== q.farmer) return false;
  if (q.q && ![lot.lot_id, lot.crop, lot.variety, lot.region, lot.farmer_id].some((f) => ci(f, q.q!))) return false;
  return true;
}

@Injectable()
export class LotsService {
  private readonly logger = new Logger(LotsService.name);
  /** Skip the RPC fallback for a while after it failed (e.g. contract not deployed). */
  private fallbackBlockedUntil = 0;

  constructor(
    private readonly repo: LotsRepository,
    private readonly rpc: NearRpcService,
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly ai: AiService,
    private readonly config: AppConfig,
  ) {}

  /** Mirror first; when the mirror is empty, read the chain (and fill the mirror). */
  async list(q: LotsQuery): Promise<LotView[]> {
    const ci = { mode: 'insensitive' as const };
    const where: Prisma.LotWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.crop ? { crop: { contains: q.crop, ...ci } } : {}),
      ...(q.region ? { region: { contains: q.region, ...ci } } : {}),
      ...(q.holder ? { holder: q.holder } : {}),
      ...(q.farmer ? { farmerId: q.farmer } : {}),
      ...(q.q
        ? {
            OR: [
              { lotId: { contains: q.q, ...ci } },
              { crop: { contains: q.q, ...ci } },
              { variety: { contains: q.q, ...ci } },
              { region: { contains: q.q, ...ci } },
              { farmerId: { contains: q.q, ...ci } },
            ],
          }
        : {}),
    };
    if ((await this.repo.count()) > 0) {
      return (await this.repo.findMany(where)).map((l) => LotsRepository.toView(l));
    }
    if (Date.now() < this.fallbackBlockedUntil) return [];
    try {
      const lots = await this.rpc.getLots(0, 100);
      await Promise.all(lots.map((l) => this.repo.upsert(l)));
      return lots.filter((l) => matches(l, q));
    } catch (err) {
      this.fallbackBlockedUntil = Date.now() + 30_000;
      this.logger.warn(`get_lots fallback failed (contract not deployed?): ${String(err).slice(0, 160)}`);
      return [];
    }
  }

  async getView(lotId: string): Promise<LotView | null> {
    const row = await this.repo.find(lotId);
    if (row) return LotsRepository.toView(row);
    try {
      const view = await this.rpc.getLot(lotId);
      if (view) await this.repo.upsert(view);
      return view;
    } catch (err) {
      this.logger.debug(`get_lot(${lotId}) failed: ${String(err).slice(0, 160)}`);
      return null;
    }
  }

  async get(lotId: string) {
    const view = await this.getView(lotId);
    if (!view) throw new NotFoundException('Lot not found');
    const evidence = await this.evidence.listForLot(lotId);
    const aiChecks = await this.ai.listForEvidence(evidence.map((e) => e.id));
    return { ...view, evidence, aiChecks };
  }

  async history(lotId: string) {
    const rows = await this.prisma.lotEvent.findMany({
      where: { lotId },
      orderBy: [{ blockTimestamp: 'asc' }, { index: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      lotId: r.lotId,
      event: r.event,
      data: r.data,
      txHash: r.txHash,
      receiptId: r.receiptId,
      signerId: r.signerId,
      blockTimestamp: r.blockTimestamp.toISOString(),
      explorerUrl: this.config.explorerTxUrl(r.txHash),
    }));
  }

  /** NEP-177 `reference` JSON for the lot NFT. */
  async metadata(lotId: string) {
    const view = await this.getView(lotId);
    if (!view) throw new NotFoundException('Lot not found');
    const photo = (await this.evidence.listForLot(lotId)).find((e) => e.kind === 'PLOT' || e.kind === 'FIELD_VISIT');
    const kg = view.projected_kg.toLocaleString('en-US');
    return {
      name: `Pratala ${view.lot_id}: ${kg} kg ${view.crop}${view.variety ? ` (${view.variety})` : ''}`,
      description:
        `Harvest projection of ${kg} kg ${view.crop} from ${view.region}, harvest ${view.harvest_month}. ` +
        'Holding this NFT entitles the holder to the lot escrow refund claim after settlement. ' +
        'Verified by field agent, cooperative and warehouse attestations on NEAR.',
      image: photo?.uri ?? null,
      external_url: `${this.config.get('FRONTEND_ORIGIN').split(',')[0]}/lot/${view.lot_id}`,
      attributes: [
        { trait_type: 'Crop', value: view.crop },
        { trait_type: 'Variety', value: view.variety ?? 'n/a' },
        { trait_type: 'Region', value: view.region },
        { trait_type: 'Projected kg', value: view.projected_kg },
        { trait_type: 'Harvest month', value: view.harvest_month },
        { trait_type: 'Status', value: view.status },
        { trait_type: 'Price per kg (pUSDC)', value: formatUnits(view.price_per_kg) },
        { trait_type: 'Funding total (pUSDC)', value: formatUnits(view.funding_total) },
        { trait_type: 'Attestations', value: view.attestations?.length ?? 0 },
      ],
      properties: {
        lot_id: view.lot_id,
        farmer_id: view.farmer_id,
        plot_hash: view.plot_hash,
        gps_hash: view.gps_hash,
        contract: this.rpc.lotsContract,
        evidence_hashes: (view.attestations ?? []).map((a) => a.evidence_hash),
      },
    };
  }
}
