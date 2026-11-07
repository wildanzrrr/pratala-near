"use client";

import { useState } from "react";

import { Warning, SealCheck } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EvidenceUploader, evidenceDigest } from "@/components/evidence/evidence-uploader";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { TrustPanel } from "@/components/trust/trust-panel";
import { sha256Hex } from "@/lib/utils";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useAttestCoopMutation } from "@/hooks/mutations/use-attest-coop-mutation";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/providers/locale-provider";

import type { EvidenceItem } from "@/components/evidence/evidence-uploader";
import type { LotView } from "@/lib/near/types";

/**
 * Co-op review: read the field agent's evidence, optionally add a photo, approve.
 * Without a photo the evidence hash is the sha256 of the review record itself.
 */
export function CoopTask({ lot, onDone }: { lot: LotView; onDone: () => void }) {
  const t = useT();
  const session = useSession();
  const health = useApiHealth();
  const [photos, setPhotos] = useState<EvidenceItem[]>([]);
  const [note, setNote] = useState("");
  const attest = useAttestCoopMutation(onDone);
  const field = lot.attestations.find((a) => a.kind === "FieldVisit");
  const sameSigner = field?.signer === session.accountId;

  async function submit() {
    const ready = photos.filter((p) => p.sha256);
    const d = ready.length ? await evidenceDigest(ready) : null;
    const evidenceHash =
      d?.evidenceHash ??
      (await sha256Hex(JSON.stringify({ lot: lot.lot_id, reviewOf: field?.evidence_hash ?? null, reviewer: session.accountId, note: note.trim() })));
    attest.mutate({ lot_id: lot.lot_id, evidence_hash: evidenceHash, evidence_uri: d?.evidenceUri ?? null, note: note.trim() || null });
  }

  return (
    <div className="flex flex-col gap-5">
      <details className="rounded-md border border-border bg-card p-3" open>
        <summary className="cursor-pointer text-sm font-medium">{t("verify.previous")}</summary>
        <div className="pt-4">
          <TrustPanel lot={lot} />
        </div>
      </details>
      <EvidenceUploader items={photos} onItemsChange={setPhotos} kind="COOP_REVIEW" lotId={lot.lot_id} canUpload={!health.isError && session.signedInToApi} max={2} label={t("evidence.add")} />
      <Field>
        <FieldLabel htmlFor="coop-note">{t("verify.note")}</FieldLabel>
        <Textarea id="coop-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      {sameSigner ? (
        <p className="flex items-center gap-2 text-sm text-attention-foreground">
          <Warning aria-hidden className="size-4" />
          {t("verify.sameSigner")}
        </p>
      ) : null}
      <Button size="lg" onClick={submit} disabled={attest.isPending || sameSigner || photos.some((p) => p.status === "reading" || p.status === "uploading")}>
        {attest.isPending ? <Spinner data-icon="inline-start" /> : <SealCheck data-icon="inline-start" />}
        {t("verify.attestCoop")}
      </Button>
      <TxStatusLine status={attest.status} data={attest.data} error={attest.error} silent={session.hasFunctionCallKey} />
    </div>
  );
}
