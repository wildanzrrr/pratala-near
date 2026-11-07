import { z } from 'zod';

export const aiCheckSchema = z.object({
  evidenceId: z.uuid(),
  kind: z.enum(['FIELD_VISIT', 'COOP_REVIEW', 'WEIGH_IN', 'PLOT']),
  expectedCrop: z.string().trim().min(1).max(80).optional(),
  plotLat: z.number().min(-90).max(90).optional(),
  plotLng: z.number().min(-180).max(180).optional(),
});
export type AiCheckDto = z.infer<typeof aiCheckSchema>;
