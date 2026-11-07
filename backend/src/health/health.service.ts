import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import {
  ContractState,
  NearRpcService,
} from '../common/near/rpc.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { modelTier } from '../ai/ai.models.js';

export interface HealthReport {
  ok: boolean;
  db: 'ok' | 'down';
  chain: {
    network: string;
    rpc: 'ok' | 'unreachable';
    lotsContract: ContractState;
    pusdcContract: ContractState;
    lotsContractId: string;
    pusdcContractId: string;
  };
  ai: { configured: boolean; model: string; tier: string };
  time: string;
}

const CACHE_MS = 10_000;

@Injectable()
export class HealthService {
  private cached: { at: number; chain: HealthReport['chain'] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rpc: NearRpcService,
    private readonly config: AppConfig,
  ) {}

  private async chain(): Promise<HealthReport['chain']> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached.chain;
    }
    const reachable = await this.rpc.rpcReachable();
    const [lots, pusdc] = reachable
      ? await Promise.all([
          this.rpc.contractState(this.rpc.lotsContract),
          this.rpc.contractState(this.rpc.pusdcContract),
        ])
      : (['unknown', 'unknown'] as const);
    const chain: HealthReport['chain'] = {
      network: this.config.get('NEAR_NETWORK'),
      rpc: reachable ? 'ok' : 'unreachable',
      lotsContract: lots,
      pusdcContract: pusdc,
      lotsContractId: this.rpc.lotsContract,
      pusdcContractId: this.rpc.pusdcContract,
    };
    this.cached = { at: Date.now(), chain };
    return chain;
  }

  async report(): Promise<HealthReport> {
    const [dbOk, chain] = await Promise.all([this.prisma.ping(), this.chain()]);
    const model = this.config.get('NEAR_AI_VISION_MODEL');
    return {
      ok: dbOk,
      db: dbOk ? 'ok' : 'down',
      chain,
      ai: {
        configured: this.config.aiConfigured,
        model,
        tier: modelTier(model),
      },
      time: new Date().toISOString(),
    };
  }
}
