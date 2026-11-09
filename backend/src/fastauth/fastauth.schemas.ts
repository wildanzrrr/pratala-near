import { z } from 'zod';
import { accountIdSchema } from '../common/zod.js';

export const publicKeySchema = z
  .string()
  .trim()
  .regex(/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]{32,100}$/, 'Invalid public key');

/** Auth0 access token issued for the NEAR Auth signing audience. */
const jwtSchema = z
  .string()
  .trim()
  .min(20)
  .max(8192)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Must be a JWT');

export const createAccountSchema = z.object({
  accountId: accountIdSchema,
  publicKey: publicKeySchema,
  token: jwtSchema,
});
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

/** Which account (if any) already belongs to this login. */
export const resolveAccountSchema = z.object({ token: jwtSchema });
export type ResolveAccountDto = z.infer<typeof resolveAccountSchema>;

/**
 * Mirrors the NEAR Auth relayer protocol (`@fast-auth-near` FastAuthRelayer):
 * sign_payload is passed through verbatim into the `sign` call on the fast-auth
 * contract (string or byte array depending on SDK version).
 */
export const signTxSchema = z.object({
  guard_id: z.string().trim().min(3).max(300),
  verify_payload: jwtSchema,
  sign_payload: z.union([
    z.string().max(16_384),
    z.array(z.number().int().min(0).max(255)).max(16_384),
  ]),
  algorithm: z.enum(['eddsa', 'secp256k1', 'ecdsa']).optional(),
});
export type SignTxDto = z.infer<typeof signTxSchema>;

export const verifySsoSchema = z.object({
  accountId: accountIdSchema,
  publicKey: publicKeySchema,
  token: jwtSchema,
});
export type VerifySsoDto = z.infer<typeof verifySsoSchema>;
