export type AiKind = 'PLOT' | 'FIELD_VISIT' | 'COOP_REVIEW' | 'WEIGH_IN';

export interface PromptContext {
  kind: AiKind;
  expectedCrop?: string;
  plotLat?: number;
  plotLng?: number;
  exifLat?: number | null;
  exifLng?: number | null;
  capturedAt?: string | null;
}

const SCHEMA = `Respond with ONLY one JSON object, no markdown, matching:
{"verdict":"pass"|"review"|"fail","confidence":0.0-1.0,"findings":["short factual observation", "..."],
 "extracted":{"crop":string|null,"stage":string|null,"kg":number|null,"grade":string|null},
 "summary_en":"1-2 plain English sentences a farmer can understand"}
Use "review" whenever you are unsure. Never invent numbers you cannot read in the image.`;

const TASK: Record<AiKind, string> = {
  PLOT: `The photo should show an agricultural plot (rice paddy / field) belonging to a smallholder farmer.
Check: is it a real outdoor farm field (not a screenshot, stock render, indoor scene or a photo of a screen)?
Which crop is visible, and roughly what growth stage (land prep, seedling, vegetative, flowering, ripening, harvested)?`,
  FIELD_VISIT: `A field agent photographed this plot during a verification visit.
Check: is the scene a real outdoor field consistent with the expected crop? Visible growth stage?
Any signs of crop damage, flooding, pests or an empty/fallow field that contradict a harvest projection?`,
  COOP_REVIEW: `A cooperative / farmer-group reviewer submitted this photo (field, harvest or document) to support a lot.
Check: is it plausible supporting evidence for the expected crop? Note anything that looks edited, unrelated or inconsistent.`,
  WEIGH_IN: `This photo should show a warehouse weigh-in: a scale display or weighbridge ticket, possibly with sacks of grain.
Read the net weight in kilograms (extracted.kg) and any quality grade (extracted.grade) ONLY if clearly legible.
Check the scene is a plausible warehouse/scale setting for the expected crop.`,
};

export function buildPrompt(ctx: PromptContext): { system: string; user: string } {
  const facts: string[] = [];
  if (ctx.expectedCrop) facts.push(`Expected crop: ${ctx.expectedCrop}.`);
  if (ctx.plotLat !== undefined && ctx.plotLng !== undefined) {
    facts.push(`Registered plot location: ${ctx.plotLat.toFixed(5)}, ${ctx.plotLng.toFixed(5)}.`);
  }
  if (ctx.exifLat != null && ctx.exifLng != null) {
    facts.push(`Photo EXIF GPS: ${ctx.exifLat.toFixed(5)}, ${ctx.exifLng.toFixed(5)} (compare with the plot location if given; > 2 km apart should be a finding).`);
  } else {
    facts.push('Photo has no EXIF GPS.');
  }
  if (ctx.capturedAt) facts.push(`Photo EXIF capture time: ${ctx.capturedAt}.`);

  return {
    system:
      'You are an agricultural evidence checker for Pratala, an Indonesian harvest-financing marketplace. ' +
      'Your output is advisory: humans (field agents, cooperatives, warehouses) make the final attestation. ' +
      'Be concise, factual and conservative.',
    user: `${TASK[ctx.kind]}\n${facts.join('\n')}\n\n${SCHEMA}`,
  };
}
