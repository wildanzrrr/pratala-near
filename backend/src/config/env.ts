import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

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
  UPLOAD_DIR: z.string().default('./data/uploads'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: optionalString,
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: bool,
  NEAR_INTENTS_BASE_URL: z.url().default('https://1click.chaindefuser.com/v0'),
  NEAR_INTENTS_API_KEY: optionalString,
  NEAR_AI_API_KEY: optionalString,
  NEAR_AI_BASE_URL: z.url().default('https://cloud-api.near.ai/v1'),
  NEAR_AI_VISION_MODEL: z.string().default('Qwen/Qwen3-VL-30B-A3B-Instruct'),
  NEAR_AI_FALLBACK_MODEL: z.string().default('z-ai/glm-5.3-flash'),
  INDEXER_POLL_MS: z.coerce.number().int().min(0).default(30_000),
  SEED_SUPPLIER_ID: z.string().default('supplier.pratala.testnet'),
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
