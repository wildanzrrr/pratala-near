import { Injectable, Logger } from '@nestjs/common';
import { NearRpcService } from './rpc.service.js';
import type { ContractConfig, Role } from './types.js';

const TTL_MS = 60_000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/** On-chain roles (`get_roles`) and `get_config`, cached for 60 s. */
@Injectable()
export class ChainRolesService {
  private readonly logger = new Logger(ChainRolesService.name);
  private readonly roles = new Map<string, Entry<Role[]>>();
  private configEntry: Entry<ContractConfig | null> | null = null;

  constructor(private readonly rpc: NearRpcService) {}

  async config(): Promise<ContractConfig | null> {
    if (this.configEntry && this.configEntry.expiresAt > Date.now()) {
      return this.configEntry.value;
    }
    let value: ContractConfig | null = null;
    try {
      value = await this.rpc.getConfig();
    } catch (err) {
      this.logger.debug(`get_config unavailable: ${String(err)}`);
    }
    this.configEntry = { value, expiresAt: Date.now() + TTL_MS };
    return value;
  }

  async rolesOf(accountId: string): Promise<Role[]> {
    const hit = this.roles.get(accountId);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    let value: Role[] = [];
    try {
      value = [...(await this.rpc.getRoles(accountId))];
    } catch (err) {
      this.logger.debug(`get_roles(${accountId}) unavailable: ${String(err)}`);
    }
    const cfg = await this.config();
    if (cfg?.owner_id === accountId && !value.includes('Admin')) {
      value.unshift('Admin');
    }
    if (this.roles.size > 10_000) this.roles.clear();
    this.roles.set(accountId, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  }
}
