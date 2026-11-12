"use client";

import { useState } from "react";

import { Scales, Sparkle } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EvidenceUploader, evidenceDigest } from "@/components/evidence/evidence-uploader";
import { Money } from "@/components/money/money";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { AiPanel } from "@/app/verify/_components/ai-panel";
import { useAutoAiCheck } from "@/app/verify/_hooks/use-auto-ai-check";
import { formatKg, settlementPreview } from "@/lib/near/format";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useWeighInMutation } from "@/hooks/mutations/use-weigh-in-mutation";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

import type { EvidenceItem } from "@/components/evidence/evidence-uploader";
import type { LotView } from "@/lib/near/types";

const GRADES = ["A", "B", "C"] as const;

/**
 * Warehouse weigh-in: ticket photo → AI reads kg/grade (prefill, never
 * auto-submits) → live payout preview with the contract's math → weigh_in.
 */
export function WeighTask({ lot, onDone }: { lot: LotView; onDone: () => void }) {
  const { t, locale } = useLocale();
  const session = useSession();
  const health = useApiHealth();
  const [photos, setPhotos] = useState<EvidenceItem[]>([]);
  const [kgText, setKgText] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [edited, setEdited] = useState(false);
  const ai = useAutoAiCheck(photos, "WEIGH_IN", lot.crop);
  const weigh = useWeighInMutation(onDone);

  // Prefill from the AI ticket read until the user edits the field themselves.
  const extracted = ai.data?.extracted;
  const kgValue = edited ? kgText : kgText || (extracted?.kg ? String(Math.round(extracted.kg)) : "");
  const gradeValue = grade || extracted?.grade || "";
  const prefilled = !edited && Boolean(extracted?.kg) && !kgText;

  const actualKg = Number.parseInt(kgValue, 10);
  const valid = Number.isFinite(actualKg) && actualKg >= 0;
  const feeBps = lot.fee_bps > 0 ? lot.fee_bps : (session.config?.fee_bps ?? 0);
  const split = valid
    ? settlementPreview({ actualKg, soldKg: lot.sold_kg, pricePerKg: lot.price_per_kg, escrow: lot.escrow, feeBps })
    : null;
  const ready = photos.filter((p) => p.status === "ready");

  async function submit() {
    if (!valid || !gradeValue || !ready.length) return;
    const d = await evidenceDigest(ready);
    weigh.mutate({
      lot_id: lot.lot_id,
      actual_kg: actualKg,
      grade: gradeValue,
      evidence_hash: d.evidenceHash,
      evidence_uri: d.evidenceUri,
      ai_check_hash: ai.data?.responseHash ?? null,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-2">{t("verify.ticketLead")}</p>
      <EvidenceUploader items={photos} onItemsChange={setPhotos} kind="WEIGH_IN" lotId={lot.lot_id} canUpload={!health.isError && session.signedInToApi} max={2} />
      <AiPanel ai={ai} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="actual-kg">{t("verify.actualKg")}</FieldLabel>
          <Input
            id="actual-kg"
            type="number"
            inputMode="numeric"
            min={0}
            className="tnum"
            value={kgValue}
            onChange={(e) => {
              setEdited(true);
              setKgText(e.target.value);
            }}
          />
          {prefilled ? (
            <FieldDescription className="flex items-center gap-1">
              <Sparkle aria-hidden className="size-3.5" />
              {t("verify.prefilled")}
            </FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel>{t("verify.grade")}</FieldLabel>
          <ToggleGroup type="single" variant="outline" value={gradeValue} onValueChange={(v) => v && setGrade(v)} className="justify-start">
            {GRADES.map((g) => (
              <ToggleGroupItem key={g} value={g} className="font-mono">
                {g}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </div>

      {split ? (
        <section aria-live="polite" className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
          <h3 className="font-sans text-base font-medium">{t("verify.previewTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("verify.previewDelivered", { kg: formatKg(split.deliveredKg, locale) })}</p>
          <dl className="tnum flex flex-col gap-1.5 text-sm">
            <PreviewRow label={t("money.farmerClaim")} amount={split.farmer} tone="text-primary" />
            <PreviewRow label={`${t("money.treasuryClaim")} (${(feeBps / 100).toLocaleString(locale)}%)`} amount={split.treasury} />
            <PreviewRow label={t("money.holderClaim")} amount={split.holder} tone="text-attention-foreground" />
          </dl>
        </section>
      ) : null}

      <Button size="lg" onClick={submit} disabled={weigh.isPending || !valid || !gradeValue || !ready.length}>
        {weigh.isPending ? <Spinner data-icon="inline-start" /> : <Scales data-icon="inline-start" />}
        {t("verify.weighIn")}
      </Button>
      <TxStatusLine status={weigh.status} data={weigh.data} error={weigh.error} silent={session.hasFunctionCallKey} />
    </div>
  );
}

function PreviewRow({ label, amount, tone }: { label: string; amount: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd>
        <Money base={amount} className={tone} />
      </dd>
    </div>
  );
}
