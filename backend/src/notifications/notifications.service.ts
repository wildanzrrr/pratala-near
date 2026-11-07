import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NotifyInput {
  dedupeKey: string;
  accountId: string;
  type: string;
  lotId?: string | null;
  /** Indonesian + English copy; the recipient's profile locale picks one. */
  text: { id: { title: string; body: string }; en: { title: string; body: string } };
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(n: Notification) {
    return {
      id: n.id,
      accountId: n.accountId,
      type: n.type,
      /** alias of `type` (frontend AppNotification.kind) */
      kind: n.type,
      lotId: n.lotId,
      title: n.title,
      body: n.body,
      data: n.data,
      read: Boolean(n.readAt),
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }

  /** Idempotent on dedupeKey (re-indexing a tx never duplicates inbox rows). */
  async notify(input: NotifyInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { accountId: input.accountId },
      select: { locale: true },
    });
    const copy = user?.locale === 'en' ? input.text.en : input.text.id;
    await this.prisma.notification.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        dedupeKey: input.dedupeKey,
        accountId: input.accountId,
        type: input.type,
        lotId: input.lotId ?? null,
        title: copy.title,
        body: copy.body,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  async list(accountId: string, unreadOnly = false) {
    const rows = await this.prisma.notification.findMany({
      where: { accountId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((n) => this.toView(n));
  }

  async markRead(accountId: string, id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row || row.accountId !== accountId) throw new NotFoundException('Notification not found');
    const updated = row.readAt
      ? row
      : await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return this.toView(updated);
  }
}
