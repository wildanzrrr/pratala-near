import { z } from 'zod';
import { parseUnits } from '../common/money.js';

const price = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    try {
      const base = parseUnits(typeof v === 'number' ? String(v) : v);
      if (BigInt(base) <= 0n) throw new Error('Price must be greater than zero');
      return base;
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message });
      return z.NEVER;
    }
  });

export const listingCategorySchema = z.enum(['SEED', 'FERTILIZER', 'SOIL', 'OTHER']);

export const createListingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  category: listingCategorySchema,
  description: z.string().trim().min(1).max(2000),
  /** Decimal pUSDC per unit, e.g. "12.50"; stored as base units. */
  priceUsdc: price,
  unit: z.string().trim().min(1).max(32),
  stock: z.number().int().min(0).max(1_000_000),
  region: z.string().trim().min(1).max(120),
});
export type CreateListingDto = z.infer<typeof createListingSchema>;

export const updateListingSchema = createListingSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateListingDto = z.infer<typeof updateListingSchema>;

export const listingsQuerySchema = z.object({
  category: listingCategorySchema.optional(),
  region: z.string().trim().max(120).optional(),
  seller: z.string().trim().max(64).optional(),
  q: z.string().trim().max(120).optional(),
});
export type ListingsQuery = z.infer<typeof listingsQuerySchema>;
