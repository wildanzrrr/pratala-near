import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import type { Evidence } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MAX_EVIDENCE_BYTES,
  readExif,
  sha256Hex,
  sniffImageMime,
} from './evidence.util.js';
import type { UploadEvidenceDto } from './evidence.schemas.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  type StoredObject,
} from './storage/storage.provider.js';

export interface EvidenceView {
  id: string;
  sha256: string;
  uri: string;
  mime: string;
  sizeBytes: number;
  lat: number | null;
  lng: number | null;
  capturedAt: string | null;
  kind: string;
  lotId: string | null;
  plotId: string | null;
  uploaderId: string;
  createdAt: string;
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  toView(e: Evidence): EvidenceView {
    return {
      id: e.id,
      sha256: e.sha256,
      uri: this.config.evidenceUri(e.sha256),
      mime: e.mime,
      sizeBytes: e.sizeBytes,
      lat: e.lat,
      lng: e.lng,
      capturedAt: e.capturedAt?.toISOString() ?? null,
      kind: e.kind,
      lotId: e.lotId,
      plotId: e.plotId,
      uploaderId: e.uploaderId,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async upload(
    uploaderId: string,
    file: { buffer: Buffer; size: number } | undefined,
    dto: UploadEvidenceDto,
  ): Promise<EvidenceView> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Multipart field "file" is required');
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      throw new PayloadTooLargeException('Evidence images are limited to 8 MB');
    }
    const mime = sniffImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException('Only JPEG, PNG, WebP, HEIC or AVIF images are accepted');
    }
    if (dto.plotId) {
      const plot = await this.prisma.plot.findUnique({ where: { id: dto.plotId } });
      if (!plot) throw new NotFoundException('Plot not found');
      if (plot.ownerId !== uploaderId) throw new ForbiddenException('Not your plot');
    }

    const sha256 = sha256Hex(file.buffer);
    const exif = await readExif(file.buffer);
    await this.storage.put(sha256, file.buffer, mime);
    await this.prisma.user.upsert({
      where: { accountId: uploaderId },
      create: { accountId: uploaderId },
      update: {},
    });
    const row = await this.prisma.evidence.create({
      data: {
        sha256,
        uploaderId,
        kind: dto.kind,
        lotId: dto.lotId ?? null,
        plotId: dto.plotId ?? null,
        mime,
        sizeBytes: file.buffer.length,
        storageKey: sha256,
        lat: exif.lat,
        lng: exif.lng,
        capturedAt: exif.capturedAt,
      },
    });
    return this.toView(row);
  }

  async findById(id: string): Promise<Evidence> {
    const row = await this.prisma.evidence.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Evidence not found');
    return row;
  }

  async open(sha256: string): Promise<{ mime: string; obj: StoredObject }> {
    const row = await this.prisma.evidence.findFirst({
      where: { sha256 },
      orderBy: { createdAt: 'asc' },
    });
    if (!row) throw new NotFoundException('Evidence not found');
    const obj = await this.storage.get(row.storageKey);
    if (!obj) throw new NotFoundException('Evidence file missing from storage');
    return { mime: row.mime, obj };
  }

  /** Raw bytes, for the AI check (≤ 8 MB by construction). */
  async readBytes(row: Evidence): Promise<Buffer> {
    const obj = await this.storage.get(row.storageKey);
    if (!obj) throw new NotFoundException('Evidence file missing from storage');
    const chunks: Buffer[] = [];
    for await (const chunk of obj.stream) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
  }

  async listForLot(lotId: string): Promise<EvidenceView[]> {
    const rows = await this.prisma.evidence.findMany({
      where: { lotId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toView(r));
  }
}
