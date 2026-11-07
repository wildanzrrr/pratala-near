import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { apiError } from '../common/filters/http-exception.filter.js';
import { formatUnits } from '../common/money.js';
import { NearRpcService } from '../common/near/rpc.service.js';
import type { Order } from '../generated/prisma/client.js';
import { ListingsService } from '../listings/listings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { verifyFtTransfer } from './ft-transfer.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly rpc: NearRpcService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  private toView(o: Order & { listing?: { title: string; unit: string } }) {
    return {
      id: o.id,
      listingId: o.listingId,
      listingTitle: o.listing?.title ?? null,
      buyerId: o.buyerId,
      sellerId: o.sellerId,
      qty: o.qty,
      memo: o.memo,
      amount: formatUnits(o.amountBase),
      amountBase: o.amountBase,
      status: o.status,
      txHash: o.txHash,
      explorerUrl: this.config.explorerTxUrl(o.txHash),
      paidAt: o.paidAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      /** What the wallet must sign (one action, 1 yoctoNEAR deposit). */
      transfer: {
        receiverId: this.rpc.pusdcContract,
        methodName: 'ft_transfer',
        args: { receiver_id: o.sellerId, amount: o.amountBase, memo: o.memo },
        deposit: '1',
        gas: '30000000000000',
      },
    };
  }

  async create(buyerId: string, listingId: string, qty: number) {
    const listing = await this.listings.get(listingId);
    if (!listing.active) throw new BadRequestException('Listing is not active');
    if (listing.sellerId === buyerId) throw new BadRequestException('You cannot buy your own listing');
    if (qty > listing.stock) throw new BadRequestException(`Only ${listing.stock} ${listing.unit} in stock`);
    await this.prisma.user.upsert({ where: { accountId: buyerId }, create: { accountId: buyerId }, update: {} });
    const id = randomUUID();
    const order = await this.prisma.order.create({
      data: {
        id,
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        qty,
        amountBase: (BigInt(listing.priceBase) * BigInt(qty)).toString(),
        memo: `order:${id}`,
      },
      include: { listing: { select: { title: true, unit: true } } },
    });
    return this.toView(order);
  }

  async mine(accountId: string) {
    const rows = await this.prisma.order.findMany({
      where: { OR: [{ buyerId: accountId }, { sellerId: accountId }] },
      include: { listing: { select: { title: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((o) => this.toView(o));
  }

  /** Mark PAID after verifying the pUSDC ft_transfer on-chain. Idempotent for the same tx. */
  async confirm(orderId: string, txHash: string, callerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { select: { title: true, unit: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (callerId !== order.buyerId) throw new ForbiddenException('Only the buyer can confirm this order');
    if (order.status === 'PAID') {
      if (order.txHash === txHash) return this.toView(order);
      throw new ConflictException('Order already paid with another transaction');
    }
    const used = await this.prisma.order.findUnique({ where: { txHash } });
    if (used && used.id !== order.id) throw new ConflictException('Transaction already used for another order');

    let tx;
    try {
      tx = await this.rpc.txStatus(txHash, order.buyerId);
    } catch (err) {
      throw apiError(502, 'chain_unavailable', { message: String(err).slice(0, 200) });
    }
    const check = verifyFtTransfer(tx, {
      tokenContract: this.rpc.pusdcContract,
      buyer: order.buyerId,
      seller: order.sellerId,
      amountBase: order.amountBase,
      memo: order.memo,
    });
    if (!check.ok) throw apiError(400, 'transfer_mismatch', { message: check.reason });

    const paid = await this.prisma.$transaction(async (db) => {
      const updated = await db.order.update({
        where: { id: order.id },
        data: { status: 'PAID', txHash, paidAt: new Date() },
        include: { listing: { select: { title: true, unit: true } } },
      });
      const listing = await db.inputListing.findUniqueOrThrow({ where: { id: order.listingId } });
      await db.inputListing.update({
        where: { id: order.listingId },
        data: { stock: Math.max(0, listing.stock - order.qty) },
      });
      await db.payment.upsert({
        where: { dedupeKey: `order:${order.id}` },
        create: {
          dedupeKey: `order:${order.id}`,
          orderId: order.id,
          type: 'INPUT_PURCHASE',
          fromAccount: order.buyerId,
          toAccount: order.sellerId,
          amountBase: order.amountBase,
          status: 'PAID',
          txHash,
          note: `${order.memo} ${order.qty} x ${listing.title}`.slice(0, 200),
        },
        update: {},
      });
      return updated;
    });

    const amount = formatUnits(order.amountBase);
    const title = order.listing.title;
    await this.notifications.notify({
      dedupeKey: `order-paid:${order.id}:${order.sellerId}`,
      accountId: order.sellerId,
      type: 'order_paid',
      text: { title: 'Order paid', body: `${order.qty} ${order.listing.unit} ${title} paid ${amount} pUSDC by ${order.buyerId}.` },
      data: { orderId: order.id, txHash },
    });
    return this.toView(paid);
  }
}
