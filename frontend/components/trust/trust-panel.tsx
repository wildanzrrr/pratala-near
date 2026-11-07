"use client";

import { useState } from "react";

import { Camera, CheckCircle, CircleDashed, Warehouse, UsersThree, Plant, Warning } from "@phosphor-icons/react";

import { AccountLink } from "@/components/common/explorer-link";
import { CopyButton } from "@/components/common/copy-button";
import { AiCheckBadge, AiHashLine } from "@/components/trust/ai-check-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime, formatKg, shortHash } from "@/lib/near/format";
import { cn } from "@/lib/utils";
import { useEvidence } from "@/hooks/queries/use-lot-api";
import { useLocale } from "@/providers/locale-provider";

import type { Icon } from "@phosphor-icons/react";
import type { AiCheck, Attestation, AttestationKind, Evidence, LotView } from "@/lib/near/types";
import type { MessageKey } from "@/lib/i18n/types";

const LAYERS: Array<{ kind: AttestationKind; label: MessageKey; icon: Icon }> = [
  { kind: "FieldVisit", label: "trust.layer1", icon: Plant },
  { kind: "CoopReview", label: "trust.layer2", icon: UsersThree },
  { kind: "WarehouseWeighIn", label: "trust.layer3", icon: Warehouse },
];

/**
 * Three-layer verification with the evidence a buyer needs before paying:
 * signer, time, photo, sha256 fingerprints, AI verdict. Chain data first;
 * photos and AI detail are layered on when the API answers.
 */
export function TrustPanel({ lot }: { lot: LotView }) {
  const { t } = useLocale();
  const offchain = useEvidence(lot.lot_id);
  const failure = lot.attestations.find((a) => a.kind === "CropFailure");
  const layers = failure ? [...LAYERS.slice(0, 2), { kind: "CropFailure" as const, label: "trust.failure" as const, icon: Warning }] : LAYERS;

  return (
    <section aria-labelledby="trust-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="trust-title" className="text-2xl">
          {t("trust.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("trust.lead")}</p>
      </div>
      <ol className="flex flex-col">
        {layers.map((layer, i) => {
          const att = lot.attestations.find((a) => a.kind === layer.kind);
          return (
            <li key={layer.kind} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-full border",
                    att ? "border-primary bg-success text-primary" : "border-dashed border-rule-strong text-muted-foreground",
                    layer.kind === "CropFailure" && "border-attention-foreground bg-attention text-attention-foreground",
                  )}
                >
                  {att ? <layer.icon aria-hidden className="size-4" /> : <CircleDashed aria-hidden className="size-4" />}
                </span>
                {i < layers.length - 1 ? <span aria-hidden className="w-px flex-1 bg-border" /> : null}
              </div>
              <div className="flex min-w-0 flex-col gap-2 pb-6">
                <h3 className="flex items-center gap-2 pt-1 font-sans text-base font-medium">
                  {t(layer.label)}
                  {att ? <CheckCircle aria-label="✓" weight="fill" className="size-4 text-primary" /> : null}
                </h3>
                {att ? (
                  <AttestationBody
                    att={att}
                    evidence={offchain.data?.evidence ?? []}
                    aiChecks={offchain.data?.aiChecks ?? []}
                    loadingOffchain={offchain.isPending && offchain.fetchStatus !== "idle"}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("trust.pending")}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function AttestationBody({
  att,
  evidence,
  aiChecks,
  loadingOffchain,
}: {
  att: Attestation;
  evidence: Evidence[];
  aiChecks: AiCheck[];
  loadingOffchain: boolean;
}) {
  const { t, locale } = useLocale();
  const photo = evidence.find((e) => e.sha256 === att.evidence_hash);
  const photoUrl = photo?.uri ?? att.evidence_uri ?? null;
  const ai = att.ai_check_hash ? aiChecks.find((c) => c.responseHash === att.ai_check_hash) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted-foreground">{t("trust.signer")}</dt>
        <dd className="min-w-0">
          <AccountLink accountId={att.signer} />
        </dd>
        <dt className="text-muted-foreground">{t("trust.time")}</dt>
        <dd>{formatDateTime(att.timestamp_ms, locale)}</dd>
        {att.actual_kg !== null ? (
          <>
            <dt className="text-muted-foreground">{t("trust.actual")}</dt>
            <dd className="tnum">
              {formatKg(att.actual_kg, locale)}
              {att.grade ? ` · ${t("trust.grade")} ${att.grade}` : ""}
            </dd>
          </>
        ) : null}
        {att.note ? (
          <>
            <dt className="text-muted-foreground">{t("trust.note")}</dt>
            <dd className="text-ink-2">{att.note}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t("trust.evidenceHash")}</dt>
        <dd className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-xs" title={att.evidence_hash}>
            {shortHash(att.evidence_hash, 10, 8)}
          </span>
          <CopyButton value={att.evidence_hash} />
        </dd>
        {att.gps_hash ? (
          <>
            <dt className="text-muted-foreground">{t("trust.gpsHash")}</dt>
            <dd className="truncate font-mono text-xs" title={att.gps_hash}>
              {shortHash(att.gps_hash, 10, 8)}
            </dd>
          </>
        ) : null}
      </dl>
      {loadingOffchain ? (
        <Skeleton className="h-28 w-full max-w-xs" />
      ) : photoUrl ? (
        <EvidenceThumb src={photoUrl.startsWith("http") ? photoUrl : api.evidenceUrl(att.evidence_hash)} />
      ) : null}
      {ai ? <AiCheckBadge check={ai} /> : att.ai_check_hash ? <AiHashLine hash={att.ai_check_hash} /> : null}
    </div>
  );
}

function EvidenceThumb({ src }: { src: string }) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Camera aria-hidden className="size-3.5" />
        {t("trust.noPhoto")}
      </p>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-md border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element -- evidence lives on the Pratala API origin */}
      <img src={src} alt={t("trust.evidence")} loading="lazy" onError={() => setFailed(true)} className="h-28 w-40 object-cover" />
    </a>
  );
}
