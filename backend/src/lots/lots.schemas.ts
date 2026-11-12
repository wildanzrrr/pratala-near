import { z } from 'zod';

export const lotStatusSchema = z.enum([
  'Registered',
  'FieldVerified',
  'CoopVerified',
  'Listed',
  'Funded',
  'Settled',
  'Refunded',
  'Cancelled',
]);

export const lotsQuerySchema = z.object({
  status: lotStatusSchema.optional(),
  crop: z.string().trim().max(80).optional(),
  region: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  farmer: z.string().trim().max(64).optional(),
});
export type LotsQuery = z.infer<typeof lotsQuerySchema>;

export const lotIdSchema = z.string().regex(/^lot-\d{1,12}$/, 'lotId must look like "lot-1"');

/** Share NFT ids are "{lotId}:{n}", e.g. "lot-1:3". */
export const shareIdSchema = z.string().regex(/^lot-\d{1,12}:\d{1,10}$/, 'shareId must look like "lot-1:3"');
