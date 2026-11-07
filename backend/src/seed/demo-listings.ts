import type { PrismaClient } from '../generated/prisma/client.js';
import { parseUnits } from '../common/money.js';

/**
 * Demo farm-input listings. Fixed ids so re-seeding is idempotent. Clearly
 * labelled demo data: prices are illustrative testnet pUSDC, not market quotes.
 */
export const DEMO_LISTINGS = [
  {
    id: '6f1d1c5e-0c5a-4b8e-9a51-2a3f6d1b0001',
    title: '[Demo] Rice seed, Inpari 32, 5 kg',
    category: 'SEED' as const,
    description:
      'Demo listing. Certified rice seed (Inpari 32 HDB variety), 5 kg bag, enough for roughly 0.2 ha transplanted. ' +
      'Testnet pUSDC only; no goods are shipped.',
    priceUsdc: '6.50',
    unit: 'bag (5 kg)',
    stock: 40,
    region: 'West Java',
  },
  {
    id: '6f1d1c5e-0c5a-4b8e-9a51-2a3f6d1b0002',
    title: '[Demo] Organic compost fertilizer, 25 kg',
    category: 'FERTILIZER' as const,
    description:
      'Demo listing. Composted organic fertilizer (manure + rice straw), 25 kg sack. ' +
      'Testnet pUSDC only; no goods are shipped.',
    priceUsdc: '4.00',
    unit: 'sack (25 kg)',
    stock: 120,
    region: 'Central Java',
  },
  {
    id: '6f1d1c5e-0c5a-4b8e-9a51-2a3f6d1b0003',
    title: '[Demo] Dolomite lime soil amendment, 50 kg',
    category: 'SOIL' as const,
    description:
      'Demo listing. Dolomite lime soil amendment for acidic paddy soil, 50 kg sack. ' +
      'Testnet pUSDC only; no goods are shipped.',
    priceUsdc: '3.25',
    unit: 'sack (50 kg)',
    stock: 60,
    region: 'West Java',
  },
];

export async function seedDemoListings(prisma: PrismaClient, sellerId: string): Promise<number> {
  await prisma.user.upsert({
    where: { accountId: sellerId },
    create: { accountId: sellerId, displayName: 'Demo supplier', intent: 'supplier', region: 'West Java' },
    update: {},
  });
  for (const l of DEMO_LISTINGS) {
    const { priceUsdc, id, ...rest } = l;
    const data = { ...rest, priceBase: parseUnits(priceUsdc), sellerId };
    await prisma.inputListing.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  return DEMO_LISTINGS.length;
}
