import { z } from 'zod';

export const createPlotSchema = z.object({
  name: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  areaM2: z.number().int().positive().max(100_000_000),
  region: z.string().trim().min(1).max(120),
  evidenceIds: z.array(z.uuid()).max(20).default([]),
});
export type CreatePlotDto = z.infer<typeof createPlotSchema>;
