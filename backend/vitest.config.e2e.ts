import { defineConfig } from 'vitest/config';

// E2E runs against the external Postgres at DATABASE_URL (dev default
// localhost:5432; run `pnpm db:deploy` first). NEAR RPC and the
// evidence storage provider are replaced by in-memory fakes inside the
// tests; 1Click and NEAR AI are never called. GCS_BUCKET only satisfies
// the required env validation — no GCS request is made.
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
        process.env.DATABASE_URL ?? 'postgresql://pratala:pratala@localhost:5432/pratala',
      JWT_SECRET: 'e2e-test-secret-0123456789abcdef',
      AUTH_RECIPIENT: 'lots.pratala.testnet',
      AUTH_MESSAGE: 'Sign in to Pratala',
      INDEXER_POLL_MS: '0',
      NEAR_AI_API_KEY: '',
      NEAR_INTENTS_BASE_URL: 'http://127.0.0.1:9/v0',
      GCS_BUCKET: 'pratala-e2e-fake-bucket',
      PUBLIC_API_URL: 'http://localhost:4100',
      // Vitest loads backend/.env into process.env; the sponsor wallet (and its
      // key file) must stay unset so the 503 sponsor_unconfigured paths are real.
      SPONSOR_ACCOUNT_ID: '',
      SPONSOR_PRIVATE_KEY: '',
      SPONSOR_PRIVATE_KEY_FILE: '',
    },
  },
});
