import { Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateProfileDto } from './users.schemas.js';

export interface Profile {
  accountId: string;
  displayName: string | null;
  region: string | null;
  locale: 'id' | 'en';
  phone?: string | null;
  intent: 'farmer' | 'buyer' | 'verifier' | 'supplier' | null;
  createdAt: string;
  updatedAt: string;
}

export function toProfile(user: User, includePrivate: boolean): Profile {
  return {
    accountId: user.accountId,
    displayName: user.displayName,
    region: user.region,
    locale: user.locale,
    ...(includePrivate ? { phone: user.phone } : {}),
    intent: user.intent,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(accountId: string): Promise<User> {
    return this.prisma.user.upsert({
      where: { accountId },
      create: { accountId },
      update: {},
    });
  }

  async getProfile(accountId: string): Promise<Profile> {
    return toProfile(await this.ensure(accountId), true);
  }

  async getPublicProfile(accountId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({ where: { accountId } });
    if (!user) throw new NotFoundException('Profile not found');
    return toProfile(user, false);
  }

  async update(accountId: string, dto: UpdateProfileDto): Promise<Profile> {
    const data = {
      displayName: dto.displayName,
      region: dto.region,
      locale: dto.locale,
      phone: dto.phone ?? null,
      intent: dto.intent,
    };
    const user = await this.prisma.user.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });
    return toProfile(user, true);
  }
}
