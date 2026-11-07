import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
  /** The UI is English-only. `"id"` from older clients is accepted and stored as `"en"`. */
  locale: z
    .enum(['en', 'id'])
    .optional()
    .transform(() => 'en' as const),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,24}$/, 'Invalid phone number')
    .nullish(),
  intent: z.enum(['farmer', 'buyer', 'verifier', 'supplier']),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
