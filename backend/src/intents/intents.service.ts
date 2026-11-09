import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decimalToBaseUnits, validAddress, validateQuoteBody } from './intents.util.js';

const TOKEN_CACHE_MS = 60_000;
/** Accounts on NEAR test networks cannot receive a mainnet 1Click swap. */
const TESTNET_ACCOUNT = /(?:^|\.)(?:testnet|betanet)$/i;

export interface IntentsToken {
  assetId: string;
  decimals: number;
  symbol?: string;
  blockchain?: string;
  [k: string]: unknown;
}

function upstreamError(status: number, message: string, providerStatus?: number): HttpException {
  return new HttpException(
    { error: message, custom: true, ...(providerStatus ? { providerStatus } : {}) },
    status,
  );
}

/** NEAR Intents 1Click proxy (port of the prototype server.mjs). Mainnet only. */
@Injectable()
export class IntentsService {
  private readonly logger = new Logger(IntentsService.name);
  private tokenCache: { expiresAt: number; tokens: IntentsToken[] | null } = { expiresAt: 0, tokens: null };

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  private get base(): string {
    return this.config.get('NEAR_INTENTS_BASE_URL').replace(/\/$/, '');
  }

  private get apiKey(): string | undefined {
    return this.config.get('NEAR_INTENTS_API_KEY');
  }

  /** The partner key goes on every call (the prototype only sent it on /quote). */
  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    if (this.apiKey) {
      h.Authorization = `Bearer ${this.apiKey}`;
      h['X-API-Key'] = this.apiKey;
    }
    return h;
  }

  private async fetchJson(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      this.logger.warn(`1Click ${path} unreachable: ${String(err)}`);
      throw upstreamError(502, 'NEAR Intents is unreachable');
    }
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text.slice(0, 500) };
    }
    return { response, data: data as Record<string, unknown> };
  }

  private passthroughStatus(response: Response): number {
    return response.ok ? response.status : response.status >= 500 ? 502 : 400;
  }

  async tokens(): Promise<IntentsToken[]> {
    if (this.tokenCache.tokens && Date.now() < this.tokenCache.expiresAt) return this.tokenCache.tokens;
    const { response, data } = await this.fetchJson('/tokens', { headers: this.headers() });
    if (!response.ok) throw upstreamError(502, 'NEAR Intents token list is unavailable');
    const tokens = Array.isArray(data) ? data : (data as { tokens?: unknown }).tokens;
    if (!Array.isArray(tokens)) throw upstreamError(502, 'Unexpected token-list response from NEAR Intents');
    this.tokenCache = { expiresAt: Date.now() + TOKEN_CACHE_MS, tokens: tokens as IntentsToken[] };
    return tokens as IntentsToken[];
  }

  async quote(input: unknown) {
    const validated = validateQuoteBody(input);
    if ('error' in validated) throw new BadRequestException(validated.error);
    const body = validated.body;

    // 1Click is mainnet-only: a testnet recipient makes it answer a bare
    // "Internal server error" 400. Fail fast with something actionable.
    if (TESTNET_ACCOUNT.test(body.recipient)) {
      throw new BadRequestException(
        `1Click runs on NEAR mainnet only — "${body.recipient}" is a testnet account. Enter a mainnet NEAR recipient (for example name.near).`,
      );
    }

    const tokens = await this.tokens();
    const origin = tokens.find((token) => token.assetId === body.originAsset);
    const destination = tokens.find((token) => token.assetId === body.destinationAsset);
    if (!origin || !destination) throw new BadRequestException('Choose tokens from the live NEAR Intents token list');
    if (origin.assetId === destination.assetId) throw new BadRequestException('Choose different origin and destination assets');

    let amount: string;
    try {
      amount = decimalToBaseUnits(body.amount, origin.decimals);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const deadline = new Date(Date.now() + 10 * 60_000).toISOString();
    const payload = {
      dry: body.dry,
      swapType: 'EXACT_INPUT',
      slippageTolerance: body.slippageTolerance,
      originAsset: origin.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: destination.assetId,
      amount,
      recipient: body.recipient,
      recipientType: 'DESTINATION_CHAIN',
      refundTo: body.refundTo,
      refundType: 'ORIGIN_CHAIN',
      deadline,
      referral: 'pratala',
    };

    const { response, data } = await this.fetchJson('/quote', {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      // 1Click answers some rejections (unknown recipient, bad route) with a
      // bare "Internal server error" body. Keep its correlation ref but say
      // what to check instead of passing that noise through.
      const providerMessage = typeof data?.message === 'string' ? data.message : '';
      const ref = typeof data?.correlationId === 'string' ? ` (ref ${data.correlationId})` : '';
      const message =
        providerMessage && providerMessage !== 'Internal server error'
          ? providerMessage
          : `NEAR Intents rejected the quote${ref}: check that the recipient is a mainnet NEAR account and the refund address is valid on the origin chain.`;
      throw upstreamError(response.status >= 500 ? 502 : 400, message, response.status);
    }

    const depositAddress =
      typeof (data.quote as Record<string, unknown> | undefined)?.depositAddress === 'string'
        ? ((data.quote as Record<string, unknown>).depositAddress as string)
        : null;
    await this.prisma.intentsQuote
      .create({
        data: {
          dry: body.dry,
          originAsset: origin.assetId,
          destination: destination.assetId,
          amount,
          request: payload as Prisma.InputJsonValue,
          response: data as Prisma.InputJsonValue,
          depositAddress,
        },
      })
      .catch((err: unknown) => this.logger.warn(`could not store quote: ${String(err)}`));

    return {
      quote: data,
      request: {
        originAsset: origin.assetId,
        originSymbol: origin.symbol,
        originChain: origin.blockchain,
        amount: body.amount,
        destinationAsset: destination.assetId,
        destinationSymbol: destination.symbol,
        destinationChain: destination.blockchain,
        deadline,
        dry: body.dry,
      },
      network: 'mainnet',
      dry: body.dry,
      partnerKeyConfigured: Boolean(this.apiKey),
      feeNotice: this.apiKey
        ? 'Partner authentication is configured.'
        : 'Unauthenticated 1Click quotes include an additional 0.25% platform fee on non-ANY_INPUT swaps.',
    };
  }

  async depositSubmit(input: unknown) {
    const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    if (
      !validAddress(body.depositAddress) ||
      typeof body.txHash !== 'string' ||
      body.txHash.trim().length < 8 ||
      body.txHash.trim().length > 256
    ) {
      throw new BadRequestException('A deposit address and transaction hash are required');
    }
    const { response, data } = await this.fetchJson('/deposit/submit', {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ depositAddress: body.depositAddress.trim(), txHash: body.txHash.trim() }),
    });
    return { status: this.passthroughStatus(response), data };
  }

  async status(depositAddress: unknown) {
    if (!validAddress(depositAddress)) throw new BadRequestException('A valid depositAddress is required');
    const { response, data } = await this.fetchJson(`/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
      headers: this.headers(),
    });
    return { status: this.passthroughStatus(response), data };
  }
}
