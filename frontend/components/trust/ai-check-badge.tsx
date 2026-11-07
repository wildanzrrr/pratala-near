"use client";

import { ArrowSquareOut, CheckCircle, Question, Sparkle, XCircle } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { shortHash } from "@/lib/near/format";
import { useT } from "@/providers/locale-provider";

import type { AiCheck } from "@/lib/near/types";

const VERDICT = {
  pass: { icon: CheckCircle, variant: "success" },
  review: { icon: Question, variant: "warning" },
  fail: { icon: XCircle, variant: "attention" },
} as const;

/** NEAR AI Cloud verdict + model + "Verify" link to the signed response. Advisory only. */
export function AiCheckBadge({ check }: { check: AiCheck }) {
  const t = useT();
  const v = VERDICT[check.verdict];
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-sunken p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkle aria-hidden className="size-4 text-primary" />
        <span className="font-medium">{t("ai.label")}</span>
        <Badge variant={v.variant}>
          <v.icon data-icon="inline-start" weight="bold" />
          {t(`ai.${check.verdict}`)}
        </Badge>
        <span className="tnum text-xs text-muted-foreground">{t("ai.confidence", { n: Math.round(check.confidence * (check.confidence <= 1 ? 100 : 1)) })}</span>
      </div>
      {check.summaryId || check.summaryEn ? <p className="text-ink-2">{check.summaryId || check.summaryEn}</p> : null}
      {check.findings.length ? (
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted-foreground">
          {check.findings.slice(0, 4).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t("ai.model", { model: check.model })}</span>
        {check.verifyUrl ? (
          <a href={check.verifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4">
            {t("ai.verify")}
            <ArrowSquareOut aria-hidden className="size-3" />
          </a>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("ai.advisory")}</p>
    </div>
  );
}

/** When only the on-chain fingerprint is known (API offline), show that honestly. */
export function AiHashLine({ hash }: { hash: string }) {
  const t = useT();
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Sparkle aria-hidden className="size-3.5" />
      {t("ai.onChain")}: <span className="font-mono">{shortHash(hash, 8, 6)}</span>
    </p>
  );
}
