// Seeds demo farm-input listings. Local: `pnpm db:seed` (via prisma/seed.ts).
// Container: `docker compose exec api node dist/seed/run.js`.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedDemoListings } from './demo-listings.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const seller = process.env.SEED_SUPPLIER_ID || 'supplier.pratala.testnet';
try {
  const n = await seedDemoListings(prisma, seller);
  console.log(`Seeded ${n} demo listings for ${seller}`);
} finally {
  await prisma.$disconnect();
}
