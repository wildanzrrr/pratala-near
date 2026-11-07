import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { formatUnits } from '../common/money.js';
import type { InputListing, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateListingDto, ListingsQuery, UpdateListingDto } from './listings.schemas.js';

export function toListingView(l: InputListing) {
  return {
    id: l.id,
    sellerId: l.sellerId,
    title: l.title,
    category: l.category,
    description: l.description,
    priceUsdc: formatUnits(l.priceBase),
    priceBase: l.priceBase,
    unit: l.unit,
    stock: l.stock,
    region: l.region,
    active: l.active,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListingsQuery) {
    const ci = { mode: 'insensitive' as const };
    const where: Prisma.InputListingWhereInput = {
      active: true,
      ...(q.category ? { category: q.category } : {}),
      ...(q.region ? { region: { contains: q.region, ...ci } } : {}),
      ...(q.seller ? { sellerId: q.seller } : {}),
      ...(q.q
        ? { OR: [{ title: { contains: q.q, ...ci } }, { description: { contains: q.q, ...ci } }] }
        : {}),
    };
    const rows = await this.prisma.inputListing.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map(toListingView);
  }

  async get(id: string): Promise<InputListing> {
    const row = await this.prisma.inputListing.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Listing not found');
    return row;
  }

  async create(sellerId: string, dto: CreateListingDto) {
    await this.prisma.user.upsert({ where: { accountId: sellerId }, create: { accountId: sellerId }, update: {} });
    const { priceUsdc, ...rest } = dto;
    const row = await this.prisma.inputListing.create({ data: { ...rest, priceBase: priceUsdc, sellerId } });
    return toListingView(row);
  }

  async update(sellerId: string, id: string, dto: UpdateListingDto) {
    const existing = await this.get(id);
    if (existing.sellerId !== sellerId) throw new ForbiddenException('Not your listing');
    const { priceUsdc, ...rest } = dto;
    const row = await this.prisma.inputListing.update({
      where: { id },
      data: { ...rest, ...(priceUsdc ? { priceBase: priceUsdc } : {}) },
    });
    return toListingView(row);
  }
}
