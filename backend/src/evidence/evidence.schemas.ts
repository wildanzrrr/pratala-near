import { z } from 'zod';

export const evidenceKindSchema = z.enum([
  'PLOT',
  'FIELD_VISIT',
  'COOP_REVIEW',
  'WEIGH_IN',
  'OTHER',
]);

export const uploadEvidenceSchema = z.object({
  kind: evidenceKindSchema,
  lotId: z
    .string()
    .trim()
    .regex(/^lot-\d{1,12}$/, 'lotId must look like "lot-1"')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  plotId: z.uuid().optional().or(z.literal('').transform(() => undefined)),
});
export type UploadEvidenceDto = z.infer<typeof uploadEvidenceSchema>;

export const sha256ParamSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Expected a sha256 hex digest');
