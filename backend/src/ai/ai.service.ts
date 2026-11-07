import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { apiError } from '../common/filters/http-exception.filter.js';
import { EvidenceService } from '../evidence/evidence.service.js';
import { sha256Hex } from '../evidence/evidence.util.js';
import type { AiCheck, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AI_CLIENT, type AiClient } from './ai.client.js';
import { modelTier } from './ai.models.js';
import { parseAiContent } from './ai.parser.js';
import { buildPrompt } from './ai.prompt.js';
import type { AiCheckDto } from './ai.schemas.js';

export interface AiCheckView {
  id: string;
  evidenceId: string;
  kind: string;
  model: string;
  tier: string;
  provider: 'near-ai-cloud';
  chatId: string | null;
  verdict: 'pass' | 'review' | 'fail';
  confidence: number;
  findings: string[];
  extracted: { crop?: string; stage?: string; kg?: number; grade?: string };
  summaryEn: string;
  responseHash: string;
  requestHash: string | null;
  signatureAvailable: boolean;
  signature: Record<string, unknown> | null;
  verifyUrl: string;
  createdAt: string;
}

const VERIFY_BASE = 'https://cloud.near.ai/verify';
const SIGNATURE_ATTEMPTS = 3;

/** https://cloud.near.ai/verify?model=<id>[#receipt=<base64url JSON>] (Verification Center). */
export function buildVerifyUrl(
  model: string,
  chatId: string | null,
  sig: Record<string, unknown> | null,
): string {
  const base = `${VERIFY_BASE}?model=${encodeURIComponent(model)}`;
  if (!chatId || !sig) return base;
  const receipt = {
    completionId: chatId,
    model,
    signatureKind: sig.signature_kind ?? 'provider_tee',
    signingAlgo: sig.signing_algo ?? 'ecdsa',
    signingAddress: sig.signing_address,
    signedText: sig.text,
    signature: sig.signature,
  };
  return `${base}#receipt=${Buffer.from(JSON.stringify(receipt)).toString('base64url')}`;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly config: AppConfig,
    @Inject(AI_CLIENT) private readonly client: AiClient | null,
  ) {}

  private toView(row: AiCheck): AiCheckView {
    return {
      id: row.id,
      evidenceId: row.evidenceId,
      kind: row.kind,
      model: row.model,
      tier: row.tier,
      provider: 'near-ai-cloud',
      chatId: row.chatId,
      verdict: row.verdict,
      confidence: row.confidence,
      findings: row.findings as string[],
      extracted: row.extracted as AiCheckView['extracted'],
      summaryEn: row.summaryEn,
      responseHash: row.responseHash,
      requestHash: row.requestHash,
      signatureAvailable: row.signatureAvailable,
      signature: (row.signature as Record<string, unknown> | null) ?? null,
      verifyUrl: row.verifyUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async fetchSignature(chatId: string, model: string) {
    if (!this.client) return null;
    // The signature is cached on the TEE node that served the completion; retry.
    for (let i = 0; i < SIGNATURE_ATTEMPTS; i++) {
      try {
        const sig = await this.client.signature(chatId, model);
        if (sig) return sig;
      } catch (err) {
        this.logger.debug(`signature ${chatId} attempt ${i + 1}: ${String(err)}`);
      }
      if (i < SIGNATURE_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
    return null;
  }

  private async complete(models: string[], body: Record<string, unknown>) {
    let lastErr: unknown;
    for (const model of models) {
      const request = { ...body, model };
      try {
        const res = await this.client!.complete(request);
        return { model, request, ...res };
      } catch (err) {
        lastErr = err;
        this.logger.warn(`NEAR AI ${model} failed: ${String(err)}`);
      }
    }
    throw apiError(502, 'ai_upstream_error', {
      message: `NEAR AI Cloud request failed: ${String(lastErr).slice(0, 200)}`,
    });
  }

  async check(dto: AiCheckDto, requestedBy: string): Promise<AiCheckView> {
    if (!this.client) throw apiError(503, 'ai_unavailable');
    const ev = await this.evidence.findById(dto.evidenceId);
    if (ev.uploaderId !== requestedBy && !ev.lotId) {
      throw new ForbiddenException('Only the uploader can check unattached evidence');
    }
    const bytes = await this.evidence.readBytes(ev);
    const prompt = buildPrompt({
      kind: dto.kind,
      expectedCrop: dto.expectedCrop,
      plotLat: dto.plotLat,
      plotLng: dto.plotLng,
      exifLat: ev.lat,
      exifLng: ev.lng,
      capturedAt: ev.capturedAt?.toISOString() ?? null,
    });
    const body = {
      messages: [
        { role: 'system', content: prompt.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.user },
            {
              type: 'image_url',
              image_url: { url: `data:${ev.mime};base64,${bytes.toString('base64')}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 800,
      stream: false,
    };

    const primary = this.config.get('NEAR_AI_VISION_MODEL');
    const fallback = this.config.get('NEAR_AI_FALLBACK_MODEL');
    const models = fallback && fallback !== primary ? [primary, fallback] : [primary];
    const { model, request, text } = await this.complete(models, body);

    let completion: Record<string, unknown> = {};
    try {
      completion = JSON.parse(text) as Record<string, unknown>;
    } catch {
      completion = { unparsed: text.slice(0, 2000) };
    }
    const choices = completion.choices as
      | { message?: { content?: unknown } }[]
      | undefined;
    const parsed = parseAiContent(choices?.[0]?.message?.content);
    const chatId = typeof completion.id === 'string' ? completion.id : null;
    const signature = chatId ? await this.fetchSignature(chatId, model) : null;
    const responseHash = sha256Hex(text);

    const row = await this.prisma.aiCheck.create({
      data: {
        evidenceId: ev.id,
        kind: dto.kind,
        requestedBy,
        model,
        tier: modelTier(model),
        chatId,
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        findings: parsed.findings,
        extracted: parsed.extracted,
        summaryEn: parsed.summaryEn,
        responseText: text,
        responseJson: completion as Prisma.InputJsonValue,
        responseHash,
        // The SDK sends JSON.stringify(body); hash of the image-bearing request.
        requestHash: sha256Hex(JSON.stringify(request)),
        signature: (signature ?? undefined) as Prisma.InputJsonValue | undefined,
        signatureAvailable: Boolean(signature),
        verifyUrl: buildVerifyUrl(model, chatId, signature),
      },
    });
    return this.toView(row);
  }

  async get(id: string): Promise<AiCheckView> {
    let row = await this.prisma.aiCheck.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('AI check not found');
    if (!row.signatureAvailable && row.chatId && this.client) {
      const sig = await this.fetchSignature(row.chatId, row.model);
      if (sig) {
        row = await this.prisma.aiCheck.update({
          where: { id },
          data: {
            signature: sig as Prisma.InputJsonValue,
            signatureAvailable: true,
            verifyUrl: buildVerifyUrl(row.model, row.chatId, sig),
          },
        });
      }
    }
    return this.toView(row);
  }

  async listForEvidence(evidenceIds: string[]): Promise<AiCheckView[]> {
    if (!evidenceIds.length) return [];
    const rows = await this.prisma.aiCheck.findMany({
      where: { evidenceId: { in: evidenceIds } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toView(r));
  }
}
