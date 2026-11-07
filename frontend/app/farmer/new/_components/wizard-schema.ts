import { z } from "zod";

import type { MessageKey } from "@/lib/i18n/types";

/** Crop names as recorded on-chain and shown to buyers (English). */
export const CROPS = ["Rice", "Maize", "Robusta coffee", "Arabica coffee", "Soybean", "Chilli", "Shallot", "Cocoa"] as const;

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** One schema for the whole wizard; each step validates its own fields with form.trigger(). */
export function wizardSchema(t: (k: MessageKey) => string) {
  return z.object({
    plotName: z.string().trim().min(2, t("common.tooShort")).max(80),
    region: z.string().trim().min(2, t("common.tooShort")).max(120),
    areaM2: z.coerce.number<string>().int().positive(t("common.required")).max(10_000_000),
    crop: z.enum(CROPS),
    variety: z.string().trim().max(60).optional(),
    projectedKg: z.coerce.number<string>().int().positive(t("common.required")).max(10_000_000),
    harvestMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, t("common.required")),
  });
}

export type WizardInput = z.input<ReturnType<typeof wizardSchema>>;
export type WizardValues = z.output<ReturnType<typeof wizardSchema>>;

export const STEP_FIELDS = {
  1: ["plotName", "region", "areaM2"],
  2: ["crop", "variety", "projectedKg", "harvestMonth"],
} as const;
