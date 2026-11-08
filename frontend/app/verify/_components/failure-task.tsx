"use client";

import { useState } from "react";

import { Warning } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EvidenceUploader, evidenceDigest } from "@/components/evidence/evidence-uploader";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { sha256Hex } from "@/lib/utils";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useDeclareFailureMutation } from "@/hooks/mutations/use-declare-failure-mutation";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/providers/locale-provider";

import type { EvidenceItem } from "@/components/evidence/evidence-uploader";
import type { LotView } from "@/lib/near/types";

/** Co-op records a crop failure → the whole escrow becomes the holder's refund claim. */
export function FailureTask({ lot, onDone }: { lot: LotView; onDone: () => void }) {
  const t = useT();
  const session = useSession();
  const health = useApiHealth();
  const [photos, setPhotos] = useState<EvidenceItem[]>([]);
  const [reason, setReason] = useState("");
  const declare = useDeclareFailureMutation(onDone);

  async function submit() {
    const ready = photos.filter((p) => p.status === "ready");
    const evidenceHash = ready.length
      ? (await evidenceDigest(ready)).evidenceHash
      : await sha256Hex(JSON.stringify({ lot: lot.lot_id, reason: reason.trim(), by: session.accountId }));
    declare.mutate({ lot_id: lot.lot_id, reason: reason.trim(), evidence_hash: evidenceHash });
  }

  return (
    <div className="flex flex-col gap-5">
      <EvidenceUploader items={photos} onItemsChange={setPhotos} kind="OTHER" lotId={lot.lot_id} canUpload={!health.isError && session.signedInToApi} max={3} />
      <Field>
        <FieldLabel htmlFor="failure-reason">{t("verify.reason")}</FieldLabel>
        <Input id="failure-reason" placeholder={t("verify.reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      </Field>
      <Button size="lg" variant="destructive" onClick={submit} disabled={declare.isPending || reason.trim().length < 3}>
        {declare.isPending ? <Spinner data-icon="inline-start" /> : <Warning data-icon="inline-start" />}
        {t("verify.declare")}
      </Button>
      <TxStatusLine status={declare.status} data={declare.data} error={declare.error} silent={session.hasFunctionCallKey} />
    </div>
  );
}
