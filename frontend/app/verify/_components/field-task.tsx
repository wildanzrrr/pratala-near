"use client";

import { useState } from "react";

import { Signature } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EvidenceUploader, evidenceDigest } from "@/components/evidence/evidence-uploader";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { AiPanel } from "@/app/verify/_components/ai-panel";
import { useAutoAiCheck } from "@/app/verify/_hooks/use-auto-ai-check";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useAttestFieldMutation } from "@/hooks/mutations/use-attest-field-mutation";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/providers/locale-provider";

import type { EvidenceItem } from "@/components/evidence/evidence-uploader";
import type { LotView } from "@/lib/near/types";

/** Field agent: photo (rear camera, GPS) → AI pre-check → note → attest_field, FC-key signed. */
export function FieldTask({ lot, onDone }: { lot: LotView; onDone: () => void }) {
  const t = useT();
  const session = useSession();
  const health = useApiHealth();
  const [photos, setPhotos] = useState<EvidenceItem[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ai = useAutoAiCheck(photos, "FIELD_VISIT", lot.crop);
  const attest = useAttestFieldMutation(onDone);
  const ready = photos.filter((p) => p.sha256);

  async function submit() {
    if (!ready.length) return setError(t("verify.needEvidence"));
    setError(null);
    const d = await evidenceDigest(ready);
    attest.mutate({
      lot_id: lot.lot_id,
      evidence_hash: d.evidenceHash,
      evidence_uri: d.evidenceUri,
      gps_hash: d.gpsHash ?? lot.gps_hash,
      ai_check_hash: ai.data?.responseHash ?? null,
      note: note.trim() || null,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-2">{t("verify.photoLead")}</p>
      <EvidenceUploader items={photos} onItemsChange={setPhotos} kind="FIELD_VISIT" lotId={lot.lot_id} canUpload={!health.isError && session.signedInToApi} max={3} />
      <AiPanel ai={ai} />
      <Field>
        <FieldLabel htmlFor="field-note">{t("verify.note")}</FieldLabel>
        <Textarea id="field-note" rows={3} placeholder={t("verify.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button size="lg" onClick={submit} disabled={attest.isPending || photos.some((p) => p.status === "reading" || p.status === "uploading")}>
        {attest.isPending ? <Spinner data-icon="inline-start" /> : <Signature data-icon="inline-start" />}
        {t("verify.attestField")}
      </Button>
      <TxStatusLine status={attest.status} data={attest.data} error={attest.error} silent={session.hasFunctionCallKey} />
    </div>
  );
}
