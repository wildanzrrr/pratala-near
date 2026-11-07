import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DATABASE_URL is optional at generate time (Docker build) and required for
// migrate/seed. The fallback only satisfies `prisma generate`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://pratala:pratala@localhost:5433/pratala',
  },
});
