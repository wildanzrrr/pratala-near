import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
  locale: z.enum(['id', 'en']),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,24}$/, 'Invalid phone number')
    .nullish(),
  intent: z.enum(['farmer', 'buyer', 'verifier', 'supplier']),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
