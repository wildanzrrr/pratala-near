import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Evidence, Plot } from '../generated/prisma/client.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { gpsHash, plotHash } from './plot-hash.js';
import type { CreatePlotDto } from './plots.schemas.js';

type PlotWithEvidence = Plot & { evidence: Evidence[] };

@Injectable()
export class PlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /** Owners see exact coordinates; everyone else gets them rounded to ~1 km. */
  private toView(p: PlotWithEvidence, viewer?: string) {
    const owner = viewer === p.ownerId;
    return {
      id: p.id,
      ownerId: p.ownerId,
      name: p.name,
      lat: owner ? p.lat : Math.round(p.lat * 100) / 100,
      lng: owner ? p.lng : Math.round(p.lng * 100) / 100,
      coordinatesPrecision: owner ? 'exact' : 'approx-0.01deg',
      areaM2: p.areaM2,
      region: p.region,
      plotHash: p.plotHash,
      gpsHash: p.gpsHash,
      evidenceIds: p.evidence.map((e) => e.id),
      evidence: p.evidence.map((e) => this.evidence.toView(e)),
      createdAt: p.createdAt.toISOString(),
    };
  }

  async create(ownerId: string, dto: CreatePlotDto) {
    const ids = [...new Set(dto.evidenceIds)];
    const rows = ids.length
      ? await this.prisma.evidence.findMany({ where: { id: { in: ids } } })
      : [];
    if (rows.length !== ids.length) {
      throw new BadRequestException('Unknown evidenceIds');
    }
    if (rows.some((r) => r.uploaderId !== ownerId)) {
      throw new BadRequestException('Evidence must be uploaded by the plot owner');
    }
    const hash = plotHash({
      farmer: ownerId,
      lat: dto.lat,
      lng: dto.lng,
      areaM2: dto.areaM2,
      evidenceSha256: rows.map((r) => r.sha256),
    });
    const plot = await this.prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { accountId: ownerId },
        create: { accountId: ownerId },
        update: {},
      });
      const created = await tx.plot.create({
        data: {
          ownerId,
          name: dto.name,
          lat: dto.lat,
          lng: dto.lng,
          areaM2: dto.areaM2,
          region: dto.region,
          plotHash: hash,
          gpsHash: gpsHash(dto.lat, dto.lng),
        },
      });
      if (ids.length) {
        await tx.evidence.updateMany({
          where: { id: { in: ids } },
          data: { plotId: created.id },
        });
      }
      return tx.plot.findUniqueOrThrow({
        where: { id: created.id },
        include: { evidence: true },
      });
    });
    return this.toView(plot, ownerId);
  }

  async mine(ownerId: string) {
    const plots = await this.prisma.plot.findMany({
      where: { ownerId },
      include: { evidence: true },
      orderBy: { createdAt: 'desc' },
    });
    return plots.map((p) => this.toView(p, ownerId));
  }

  async get(id: string, viewer?: string) {
    const plot = await this.prisma.plot.findUnique({
      where: { id },
      include: { evidence: true },
    });
    if (!plot) throw new NotFoundException('Plot not found');
    return this.toView(plot, viewer);
  }
}
