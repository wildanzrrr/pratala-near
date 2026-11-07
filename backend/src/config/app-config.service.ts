import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.js';

/** Typed accessor over the zod-validated environment. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get aiConfigured(): boolean {
    return Boolean(this.get('NEAR_AI_API_KEY'));
  }

  explorerTxUrl(txHash: string | null | undefined): string | null {
    if (!txHash) return null;
    return `${this.get('EXPLORER_BASE').replace(/\/$/, '')}/txns/${txHash}`;
  }

  evidenceUri(sha256: string): string {
    return `${this.get('PUBLIC_API_URL').replace(/\/$/, '')}/api/evidence/${sha256}`;
  }
}
