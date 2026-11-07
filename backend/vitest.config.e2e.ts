import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// E2E runs against the real Postgres from the root docker-compose.yml
// (`docker compose up -d postgres && pnpm db:deploy`). NEAR RPC is replaced by
// an in-memory fake inside the tests; 1Click and NEAR AI are never called.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://pratala:pratala@localhost:5433/pratala',
      JWT_SECRET: 'e2e-test-secret-0123456789abcdef',
      AUTH_RECIPIENT: 'lots.pratala.testnet',
      AUTH_MESSAGE: 'Sign in to Pratala',
      INDEXER_POLL_MS: '0',
      NEAR_AI_API_KEY: '',
      NEAR_INTENTS_BASE_URL: 'http://127.0.0.1:9/v0',
      UPLOAD_DIR: join(tmpdir(), 'pratala-e2e-uploads'),
      STORAGE_DRIVER: 'local',
      PUBLIC_API_URL: 'http://localhost:4100',
    },
  },
});
