import { randomBytes } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

/**
 * A file path that stays relative to the backend/ folder regardless of the
 * process working directory or build layout: this file sits two levels below
 * backend/ both in src/ and in the compiled dist/ tree.
 */
const backendRelativeFile = optionalString.transform((v) =>
  v && !isAbsolute(v) ? resolve(import.meta.dirname, '../..', v) : v,
);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().min(1),
  // Missing => a random per-process secret (sessions reset on restart); see main.ts warning.
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .optional()
    .transform((v) => v ?? randomBytes(32).toString('hex')),
  JWT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 3600),
  AUTH_RECIPIENT: z.string().min(1).default('lots.pratala.testnet'),
  AUTH_MESSAGE: z.string().min(1).default('Sign in to Pratala'),
  NEAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  NEAR_RPC_URL: z.url().default('https://test.rpc.fastnear.com'),
  LOTS_CONTRACT_ID: z.string().min(2).default('lots.pratala.testnet'),
  PUSDC_CONTRACT_ID: z.string().min(2).default('pusdc.pratala.testnet'),
  EXPLORER_BASE: z.url().default('https://testnet.nearblocks.io'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_API_URL: z.url().default('http://localhost:4100'),
  // Evidence storage: Google Cloud Storage only — required, no local fallback.
  GCS_BUCKET: z.string().min(1, 'GCS_BUCKET is required (evidence have no local fallback)'),
  GCS_KEY_FILE: backendRelativeFile,
  NEAR_INTENTS_BASE_URL: z.url().default('https://1click.chaindefuser.com/v0'),
  NEAR_INTENTS_API_KEY: optionalString,
  NEAR_AI_API_KEY: optionalString,
  NEAR_AI_BASE_URL: z.url().default('https://cloud-api.near.ai/v1'),
  NEAR_AI_VISION_MODEL: z.string().default('Qwen/Qwen3-VL-30B-A3B-Instruct'),
  NEAR_AI_FALLBACK_MODEL: z.string().default('z-ai/glm-5.3-flash'),
  INDEXER_POLL_MS: z.coerce.number().int().min(0).default(30_000),
  SEED_SUPPLIER_ID: z.string().default('supplier.pratala.testnet'),
  // NEAR Auth (email SSO → MPC accounts). Mainnet overrides: fast-auth.near,
  // v1.signer, login.auth.near.org, auth0.jwt.fast-auth.near.
  FASTAUTH_CONTRACT_ID: z.string().min(2).default('fast-auth.testnet'),
  FASTAUTH_MPC_CONTRACT_ID: z.string().min(2).default('v1.signer-prod.testnet'),
  FASTAUTH_AUTH0_DOMAIN: z.string().min(4).default('login.testnet.fast-auth.com'),
  FASTAUTH_SIGNING_AUDIENCE: z.string().min(4).default('auth0.jwt.fast-auth.testnet'),
  // Sponsor wallet: the ONLY account this API signs with (account creation +
  // MPC sign relaying). Unset ⇒ /fastauth/* returns 503 sponsor_unconfigured.
  SPONSOR_ACCOUNT_ID: optionalString,
  SPONSOR_PRIVATE_KEY: optionalString,
  SPONSOR_PRIVATE_KEY_FILE: backendRelativeFile,
  SPONSOR_SEED_NEAR: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'Must be a NEAR amount like 0.5')
    .default('0.5'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
