import { Injectable, Logger } from '@nestjs/common';
import { JsonRpcProvider } from 'near-api-js';
import { AppConfig } from '../../config/app-config.service.js';
import type {
  ContractConfig,
  ContractStats,
  LotView,
  Role,
  TxStatusResult,
} from './types.js';

const RPC_TIMEOUT_MS = 8_000;
/** code_hash of an account with no contract deployed. */
const EMPTY_CODE_HASH = '11111111111111111111111111111111';

export type ContractState = 'ok' | 'missing' | 'unknown';

export class ChainUnavailableError extends Error {}

function withTimeout<T>(p: Promise<T>, ms = RPC_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new ChainUnavailableError(`RPC timeout after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Read-only NEAR RPC access (near-api-js v7 JsonRpcProvider). This service
 * never signs or sends transactions.
 */
@Injectable()
export class NearRpcService {
  private readonly logger = new Logger(NearRpcService.name);
  readonly provider: JsonRpcProvider;
  private readonly blockTimeCache = new Map<string, Date>();

  constructor(private readonly config: AppConfig) {
    this.provider = new JsonRpcProvider(
      { url: config.get('NEAR_RPC_URL') },
      { retries: 2, wait: 300, backoff: 1.5 },
    );
  }

  get lotsContract(): string {
    return this.config.get('LOTS_CONTRACT_ID');
  }

  get pusdcContract(): string {
    return this.config.get('PUSDC_CONTRACT_ID');
  }

  async view<T>(
    contractId: string,
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<T | undefined> {
    return withTimeout(
      this.provider.callFunction<T & object>({ contractId, method, args }),
    ) as Promise<T | undefined>;
  }

  async getLot(lotId: string): Promise<LotView | null> {
    return (
      (await this.view<LotView | null>(this.lotsContract, 'get_lot', {
        lot_id: lotId,
      })) ?? null
    );
  }

  async getLots(fromIndex = 0, limit = 50): Promise<LotView[]> {
    return (
      (await this.view<LotView[]>(this.lotsContract, 'get_lots', {
        from_index: fromIndex,
        limit,
      })) ?? []
    );
  }

  async getRoles(accountId: string): Promise<Role[]> {
    return (
      (await this.view<Role[]>(this.lotsContract, 'get_roles', {
        account_id: accountId,
      })) ?? []
    );
  }

  async listRole(role: Exclude<Role, 'Admin'>): Promise<string[]> {
    return (
      (await this.view<string[]>(this.lotsContract, 'list_role', { role })) ??
      []
    );
  }

  async getConfig(): Promise<ContractConfig | null> {
    return (
      (await this.view<ContractConfig>(this.lotsContract, 'get_config')) ?? null
    );
  }

  async getStats(): Promise<ContractStats | null> {
    return (
      (await this.view<ContractStats>(this.lotsContract, 'get_stats')) ?? null
    );
  }

  /** `EXPERIMENTAL_tx_status` at FINAL: includes receipts_outcome with logs. */
  async txStatus(txHash: string, signerId: string): Promise<TxStatusResult> {
    const res = await withTimeout(
      this.provider.viewTransactionStatusWithReceipts({
        txHash,
        accountId: signerId,
        waitUntil: 'FINAL',
      }),
      20_000,
    );
    return res as unknown as TxStatusResult;
  }

  async blockTimestamp(blockHash: string): Promise<Date | null> {
    const cached = this.blockTimeCache.get(blockHash);
    if (cached) return cached;
    try {
      const block = await withTimeout(
        this.provider.viewBlock({ blockId: blockHash }),
      );
      const ns = BigInt(String(block.header.timestamp_nanosec));
      const date = new Date(Number(ns / 1_000_000n));
      if (this.blockTimeCache.size > 5_000) this.blockTimeCache.clear();
      this.blockTimeCache.set(blockHash, date);
      return date;
    } catch (err) {
      this.logger.warn(`viewBlock ${blockHash} failed: ${String(err)}`);
      return null;
    }
  }

  async rpcReachable(): Promise<boolean> {
    try {
      await withTimeout(this.provider.viewNodeStatus(), 5_000);
      return true;
    } catch {
      return false;
    }
  }

  async contractState(accountId: string): Promise<ContractState> {
    try {
      const account = await withTimeout(
        this.provider.viewAccount({ accountId }),
        5_000,
      );
      return account.code_hash && account.code_hash !== EMPTY_CODE_HASH
        ? 'ok'
        : 'missing';
    } catch (err) {
      const msg = String(err);
      if (/does not exist|UNKNOWN_ACCOUNT|AccountDoesNotExist/i.test(msg)) {
        return 'missing';
      }
      return 'unknown';
    }
  }
}
