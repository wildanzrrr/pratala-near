import { z } from 'zod';
import { accountIdSchema } from '../common/zod.js';

export const challengeSchema = z.object({ accountId: accountIdSchema });
export type ChallengeDto = z.infer<typeof challengeSchema>;

const base64 = z
  .string()
  .trim()
  .min(4)
  .max(512)
  .regex(/^[A-Za-z0-9+/_-]+={0,2}$/, 'Must be base64');

export const verifySchema = z.object({
  accountId: accountIdSchema,
  publicKey: z
    .string()
    .trim()
    .regex(/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]{32,100}$/, 'Invalid public key'),
  signature: base64,
  nonce: base64,
});
export type VerifyDto = z.infer<typeof verifySchema>;
