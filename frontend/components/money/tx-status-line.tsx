"use client";

import { CheckCircle, Lightning, WarningCircle } from "@phosphor-icons/react";

import { ProofLink } from "@/components/common/explorer-link";
import { Spinner } from "@/components/ui/spinner";
import { WalletRejectedError } from "@/lib/near/errors";
import { useT } from "@/providers/locale-provider";

import type { TxResult } from "@/hooks/mutations/use-tx-mutation";

/**
 * Plain-language status of one transaction, inline under the button that sent
 * it: waiting → recorded (View proof) / cancelled / failed. aria-live so
 * screen readers hear the outcome.
 */
export function TxStatusLine({
  status,
  data,
  error,
  silent,
}: {
  status: "idle" | "pending" | "success" | "error";
  data?: TxResult<unknown>;
  error?: Error | null;
  silent?: boolean;
}) {
  const t = useT();
  return (
    <p aria-live="polite" className="flex min-h-6 flex-wrap items-center gap-2 text-sm">
      {status === "pending" ? (
        <>
          <Spinner />
          <span className="text-muted-foreground">{silent ? t("tx.silent") : t("tx.pending")}</span>
        </>
      ) : status === "success" ? (
        <>
          <CheckCircle aria-hidden weight="fill" className="size-4 text-primary" />
          <span>{t("tx.done")}</span>
          {data?.hash ? <ProofLink hash={data.hash} /> : null}
        </>
      ) : status === "error" ? (
        <>
          <WarningCircle aria-hidden className="size-4 text-destructive" />
          <span className="text-destructive">
            {error instanceof WalletRejectedError ? t("tx.rejected") : (error?.message ?? t("tx.failedGeneric"))}
          </span>
        </>
      ) : silent ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lightning aria-hidden className="size-3.5 text-primary" />
          {t("verify.silent")}
        </span>
      ) : null}
    </p>
  );
}
