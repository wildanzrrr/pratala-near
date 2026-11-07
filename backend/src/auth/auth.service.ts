import { randomBytes } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verifyMessage } from 'near-api-js/nep413';
import { AppConfig } from '../config/app-config.service.js';
import { NearRpcService } from '../common/near/rpc.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChallengeDto, VerifyDto } from './auth.schemas.js';

const CHALLENGE_TTL_MS = 5 * 60_000;

function decodeBase64(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rpc: NearRpcService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async challenge({ accountId }: ChallengeDto) {
    const nonce = randomBytes(32).toString('base64');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    const message = this.config.get('AUTH_MESSAGE');
    const recipient = this.config.get('AUTH_RECIPIENT');
    await this.prisma.authChallenge.create({
      data: { accountId, nonce, message, recipient, expiresAt },
    });
    // Opportunistic cleanup of stale challenges.
    void this.prisma.authChallenge
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 3600_000) } } })
      .catch(() => undefined);
    return { nonce, message, recipient, expiresAt: expiresAt.toISOString() };
  }

  /** Verifies a NEP-413 signature over a single-use challenge; returns a JWT. */
  async verify(dto: VerifyDto): Promise<{ accountId: string; token: string }> {
    const nonceBytes = decodeBase64(dto.nonce);
    if (nonceBytes.length !== 32) {
      throw new UnauthorizedException('Nonce must be 32 bytes');
    }
    const nonce = nonceBytes.toString('base64');
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { nonce },
    });
    if (!challenge || challenge.accountId !== dto.accountId) {
      throw new UnauthorizedException('Unknown challenge');
    }
    // Consume first (single use, even when the signature is wrong).
    const consumed = await this.prisma.authChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Challenge expired or already used');
    }

    try {
      await verifyMessage({
        signerAccountId: dto.accountId,
        signerPublicKey: dto.publicKey,
        signature: new Uint8Array(decodeBase64(dto.signature)),
        payload: {
          message: challenge.message,
          recipient: challenge.recipient,
          nonce: new Uint8Array(nonceBytes),
        },
        provider: this.rpc.provider,
      });
    } catch (err) {
      this.logger.debug(`NEP-413 verify failed for ${dto.accountId}: ${String(err)}`);
      throw new UnauthorizedException(
        'Signature verification failed (the key must be a full-access key of the account)',
      );
    }

    await this.prisma.user.upsert({
      where: { accountId: dto.accountId },
      create: { accountId: dto.accountId, lastLoginAt: new Date() },
      update: { lastLoginAt: new Date() },
    });
    const token = await this.jwt.signAsync({ sub: dto.accountId });
    return { accountId: dto.accountId, token };
  }
}
