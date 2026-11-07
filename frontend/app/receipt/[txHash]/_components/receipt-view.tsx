"use client";

import Link from "next/link";

import { CheckCircle, Clock, Printer, XCircle } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountLink, ProofLink } from "@/components/common/explorer-link";
import { EmptyState } from "@/components/common/states";
import { PageBody } from "@/components/layout/page-header";
import { Wordmark } from "@/components/layout/wordmark";
import { Money, Rupiah } from "@/components/money/money";
import { useTxStatus } from "@/hooks/queries/use-tx-status";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { ChainEvent } from "@/lib/near/contracts";

const AMOUNT_FIELDS = ["amount", "farmer_claim", "holder_claim", "total"] as const;

function amountOf(events: ChainEvent[]): { amount: string | null; lotId: string | null; to: string | null } {
  for (const e of events) {
    if (e.standard !== "pratala") continue;
    for (const d of e.data) {
      for (const f of AMOUNT_FIELDS) {
        if (typeof d[f] === "string") return { amount: d[f] as string, lotId: (d.lot_id as string) ?? null, to: (d.to as string) ?? null };
      }
    }
  }
  return { amount: null, lotId: null, to: null };
}

export function ReceiptView({ txHash, signer, lotId }: { txHash: string; signer: string | null; lotId: string | null }) {
  const { t } = useLocale();
  const { signedAccountId } = useNear();
  const signerId = signer ?? (signedAccountId || null);
  const tx = useTxStatus(txHash, signerId);
  const summary = tx.data ? amountOf(tx.data.events) : { amount: null, lotId: null, to: null };
  const lot = summary.lotId ?? lotId;

  return (
    <PageBody className="max-w-2xl print:max-w-none print:py-0">
      <article className="flex flex-col gap-6 rounded-md border border-border bg-card p-5 sm:p-8 print:border-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex flex-col gap-1">
            <Wordmark />
            <h1 className="mt-3 text-3xl">{t("receipt.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("receipt.lead")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer data-icon="inline-start" />
            {t("common.print")}
          </Button>
        </header>

        {!signerId ? (
          <EmptyState title={t("receipt.notFound")} body={t("receipt.signerHint")} />
        ) : tx.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : tx.isError ? (
          <EmptyState title={t("receipt.notFound")} body={tx.error.message} />
        ) : (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-muted-foreground">{t("receipt.status")}</dt>
            <dd>
              {tx.data.state === "success" ? (
                <Badge variant="success">
                  <CheckCircle data-icon="inline-start" weight="bold" />
                  {t("receipt.success")}
                </Badge>
              ) : tx.data.state === "failure" ? (
                <Badge variant="attention">
                  <XCircle data-icon="inline-start" weight="bold" />
                  {t("receipt.failure")}
                </Badge>
              ) : (
                <Badge variant="warning">
                  <Clock data-icon="inline-start" weight="bold" />
                  {t("receipt.pending")}
                </Badge>
              )}
            </dd>
            {summary.amount ? (
              <>
                <dt className="text-muted-foreground">{t("receipt.amount")}</dt>
                <dd className="flex flex-col">
                  <Money base={summary.amount} className="text-2xl" />
                  <Rupiah base={summary.amount} />
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{t("receipt.from")}</dt>
            <dd className="min-w-0">
              <AccountLink accountId={tx.data.signerId} />
            </dd>
            {tx.data.receiverId ? (
              <>
                <dt className="text-muted-foreground">{t("receipt.to")}</dt>
                <dd className="min-w-0">
                  <AccountLink accountId={summary.to ?? tx.data.receiverId} />
                </dd>
              </>
            ) : null}
            {lot ? (
              <>
                <dt className="text-muted-foreground">{t("receipt.lot")}</dt>
                <dd>
                  <Link href={`/lot/${encodeURIComponent(lot)}`} className="font-mono text-primary underline underline-offset-4">
                    {lot}
                  </Link>
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{t("receipt.hash")}</dt>
            <dd className="flex flex-col gap-1">
              <span className="font-mono text-xs break-all">{txHash}</span>
              <ProofLink hash={txHash} className="print:hidden" />
            </dd>
            {tx.data.events.length ? (
              <>
                <dt className="text-muted-foreground">{t("receipt.events")}</dt>
                <dd>
                  <ul className="flex flex-wrap gap-1.5">
                    {tx.data.events.map((e, i) => (
                      <li key={`${e.event}-${i}`}>
                        <Badge variant="outline" className="font-mono">
                          {e.event}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}
          </dl>
        )}
      </article>
    </PageBody>
  );
}
