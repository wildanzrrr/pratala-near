import {
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/app-config.service.js';
import { apiError } from '../common/filters/http-exception.filter.js';
import { ChainRolesService } from '../common/near/roles.service.js';
import { NearRpcService } from '../common/near/rpc.service.js';
import type { LotView } from '../common/near/types.js';
import type { LotEvent, Prisma } from '../generated/prisma/client.js';
import { LotsRepository } from '../lots/lots.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseTxEvents, type ParsedEvent } from './event-parser.js';
import {
  notificationsFor,
  paymentsFor,
  type ProjectionContext,
} from './projections.js';

const RECONCILE = 'lots-reconcile';
const PAGE = 50;
const ROLE_TTL_MS = 60_000;
/** Share NFT ids minted by purchases: "lot-N:M". */
const SHARE_ID_RE = /^lot-\d{1,12}:\d{1,10}$/;

export interface LotEventView {
  id: string;
  lotId: string | null;
  event: string;
  data: unknown;
  txHash: string;
  signerId: string;
  blockTimestamp: string;
}

@Injectable()
export class IndexerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private reconciling = false;
  private lastWarnAt = 0;
  private roleCache: { at: number; roles: ProjectionContext['roles'] } | null = null;
  private bootTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rpc: NearRpcService,
    private readonly lots: LotsRepository,
    private readonly roles: ChainRolesService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const ms = this.config.get('INDEXER_POLL_MS');
    if (!ms) return;
    this.scheduler.addInterval(RECONCILE, setInterval(() => void this.reconcile(), ms));
    this.bootTimer = setTimeout(() => void this.reconcile(), 3_000);
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }

  private warn(msg: string): void {
    // At most one warning per 5 minutes while the chain/contract is unavailable.
    if (Date.now() - this.lastWarnAt < 300_000) return;
    this.lastWarnAt = Date.now();
    this.logger.warn(msg);
  }

  /** Mirror every lot from `get_lots` into Postgres. Never throws. */
  async reconcile(): Promise<number> {
    if (this.reconciling) return 0;
    this.reconciling = true;
    let synced = 0;
    try {
      for (let from = 0; from < 10_000; from += PAGE) {
        const page = await this.rpc.getLots(from, PAGE);
        for (const lot of page) await this.lots.upsert(lot);
        synced += page.length;
        if (page.length < PAGE) break;
      }
      if (synced) this.logger.debug(`reconciled ${synced} lots`);
    } catch (err) {
      this.warn(
        `Lot reconcile skipped: ${this.rpc.lotsContract} get_lots failed (contract not deployed yet?): ${String(err).slice(0, 200)}`,
      );
    } finally {
      this.reconciling = false;
    }
    return synced;
  }

  private async roleLists(): Promise<ProjectionContext['roles']> {
    if (this.roleCache && Date.now() - this.roleCache.at < ROLE_TTL_MS) return this.roleCache.roles;
    const get = (r: 'FieldAgent' | 'Coop' | 'Warehouse') => this.rpc.listRole(r).catch(() => [] as string[]);
    const [FieldAgent, Coop, Warehouse] = await Promise.all([get('FieldAgent'), get('Coop'), get('Warehouse')]);
    const roles = { FieldAgent, Coop, Warehouse };
    this.roleCache = { at: Date.now(), roles };
    return roles;
  }

  private async lotSnapshot(lotId: string): Promise<LotView | null> {
    try {
      const view = await this.rpc.getLot(lotId);
      if (view) {
        await this.lots.upsert(view);
        return view;
      }
    } catch (err) {
      this.logger.debug(`get_lot(${lotId}) failed: ${String(err).slice(0, 160)}`);
    }
    const row = await this.lots.find(lotId);
    return row ? LotsRepository.toView(row) : null;
  }

  toView(e: LotEvent): LotEventView {
    return {
      id: e.id,
      lotId: e.lotId,
      event: e.event,
      data: e.data,
      txHash: e.txHash,
      signerId: e.signerId,
      blockTimestamp: e.blockTimestamp.toISOString(),
    };
  }

  /** POST /tx: fetch at FINAL, store every trusted EVENT_JSON log, derive ledger + inbox. */
  async ingestTx(txHash: string, signerId: string): Promise<{ ok: true; events: LotEventView[] }> {
    let tx;
    try {
      tx = await this.rpc.txStatus(txHash, signerId);
    } catch (err) {
      const msg = String(err);
      if (/UNKNOWN_TRANSACTION|doesn't exist|not found|does not exist/i.test(msg)) {
        throw apiError(HttpStatus.NOT_FOUND, 'tx_not_found', { message: 'Transaction not found (yet) on this network' });
      }
      throw apiError(HttpStatus.BAD_GATEWAY, 'chain_unavailable', { message: msg.slice(0, 200) });
    }

    const parsed = parseTxEvents(tx, {
      trustedEmitters: {
        pratala: [this.rpc.lotsContract],
        nep171: [this.rpc.lotsContract],
        nep141: [this.rpc.pusdcContract],
      },
    });

    const stored: LotEvent[] = [];
    for (const ev of parsed) {
      const blockTimestamp = (await this.rpc.blockTimestamp(ev.blockHash)) ?? new Date();
      const row = await this.prisma.lotEvent.upsert({
        where: {
          txHash_receiptId_event_index: { txHash, receiptId: ev.receiptId, event: ev.event, index: ev.index },
        },
        create: {
          lotId: ev.lotId,
          standard: ev.standard,
          version: ev.version,
          event: ev.event,
          index: ev.index,
          data: ev.data as Prisma.InputJsonValue,
          txHash,
          receiptId: ev.receiptId,
          executorId: ev.executorId,
          signerId,
          blockHash: ev.blockHash,
          blockTimestamp,
        },
        update: {},
      });
      stored.push(row);
      await this.project(ev, row);
    }
    return { ok: true, events: stored.map((e) => this.toView(e)) };
  }

  private async project(ev: ParsedEvent, row: LotEvent): Promise<void> {
    // Share NFT ownership follows nep171 transfers emitted by the lots contract.
    if (
      ev.standard === 'nep171' &&
      ev.event === 'nft_transfer' &&
      typeof ev.data.new_owner_id === 'string' &&
      Array.isArray(ev.data.token_ids)
    ) {
      for (const tokenId of ev.data.token_ids) {
        if (typeof tokenId === 'string' && SHARE_ID_RE.test(tokenId)) {
          await this.prisma.lotShare.updateMany({
            where: { shareId: tokenId },
            data: { holder: ev.data.new_owner_id },
          });
        }
      }
    }
    if (ev.standard !== 'pratala' || !ev.lotId) return;
    const lot = await this.lotSnapshot(ev.lotId);
    const cfg = await this.roles.config();
    const shareRows = await this.prisma.lotShare.findMany({
      where: { lotId: ev.lotId },
      orderBy: { createdAt: 'asc' },
    });
    const ctx: ProjectionContext = {
      txHash: row.txHash,
      lotsContract: this.rpc.lotsContract,
      farmerId: lot?.farmer_id ?? null,
      crop: lot?.crop ?? null,
      treasury: cfg?.treasury ?? 'treasury',
      lot,
      shares: shareRows.map((s) => ({ shareId: s.shareId, holder: s.holder, kg: s.kg })),
      roles: await this.roleLists(),
    };

    for (const p of paymentsFor(ev, ctx)) {
      const { createOnly, ...fields } = p;
      await this.prisma.payment.upsert({
        where: { dedupeKey: p.dedupeKey },
        create: { ...fields, occurredAt: row.blockTimestamp },
        update: createOnly
          ? {}
          : {
              status: p.status,
              toAccount: p.toAccount,
              amountBase: p.amountBase,
              txHash: p.txHash,
              note: p.note,
              occurredAt: row.blockTimestamp,
            },
      });
    }

    for (const n of notificationsFor(ev, ctx)) {
      await this.notifications.notify({
        dedupeKey: `${row.txHash}:${row.receiptId}:${row.event}:${row.index}:${n.accountId}`,
        accountId: n.accountId,
        type: n.type,
        lotId: ev.lotId,
        text: n.text,
        data: { ...ev.data, txHash: row.txHash, explorerUrl: this.config.explorerTxUrl(row.txHash) },
      });
    }

    // Mirror the kg share minted by this purchase, and mark claimed refunds.
    if (
      ev.event === 'lot_funded' &&
      typeof ev.data.share_id === 'string' &&
      typeof ev.data.buyer === 'string'
    ) {
      await this.prisma.lotShare.upsert({
        where: { shareId: ev.data.share_id },
        create: {
          shareId: ev.data.share_id,
          lotId: ev.lotId,
          buyerId: ev.data.buyer,
          holder: ev.data.buyer,
          kg: typeof ev.data.kg === 'number' ? ev.data.kg : 0,
          txHash: row.txHash,
        },
        update: { holder: ev.data.buyer },
      });
    }
    if (
      ev.event === 'payout_claimed' &&
      ev.data.kind === 'Holder' &&
      ev.data.ok === true &&
      typeof ev.data.share_id === 'string'
    ) {
      await this.prisma.lotShare.updateMany({
        where: { shareId: ev.data.share_id },
        data: { claimed: true, claimedAt: row.blockTimestamp },
      });
    }
  }
}
