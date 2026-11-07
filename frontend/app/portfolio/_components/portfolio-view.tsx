"use client";

import Link from "next/link";

import { Briefcase, DownloadSimple } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { SampleBanner } from "@/components/common/sample-banner";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { LotCard, LotCardSkeleton } from "@/components/lot/lot-card";
import { TransferNftButton } from "@/components/lot/transfer-nft-dialog";
import { ClaimButton } from "@/components/money/claim-button";
import { MoneyBlock } from "@/components/money/money";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { api } from "@/lib/api";
import { canTransfer } from "@/lib/near/contracts";
import { useLotsForHolder } from "@/hooks/queries/use-lots-for-holder";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

export function PortfolioView() {
  const { t } = useLocale();
  const { signedAccountId } = useNear();
  return (
    <PageBody>
      <PageHeader
        title={t("portfolio.title")}
        lead={t("portfolio.lead")}
        actions={
          signedAccountId ? (
            <Button asChild variant="outline">
              <a href={api.paymentsCsvUrl({ account: signedAccountId })} download>
                <DownloadSimple data-icon="inline-start" />
                {t("portfolio.csv")}
              </a>
            </Button>
          ) : null
        }
      />
      <SampleBanner />
      <ConnectGate>
        <PortfolioBody />
      </ConnectGate>
    </PageBody>
  );
}

function PortfolioBody() {
  const { t } = useLocale();
  const { signedAccountId } = useNear();
  const lots = useLotsForHolder(signedAccountId);
  const held = (lots.data ?? []).filter((l) => l.farmer_id !== signedAccountId);
  const claimable = held.filter((l) => (l.status === "Settled" || l.status === "Refunded") && l.claims.holder !== "0");

  if (lots.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LotCardSkeleton />
        <LotCardSkeleton />
      </div>
    );
  }
  if (lots.isError) return <QueryErrorState error={lots.error} onRetry={() => lots.refetch()} />;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="claim-title" className="flex flex-col gap-3">
        <h2 id="claim-title" className="font-sans text-lg font-medium">
          {t("portfolio.claimTitle")}
        </h2>
        {claimable.length ? (
          <ul className="flex flex-col gap-3">
            {claimable.map((lot) => (
              <li key={lot.lot_id} className="flex flex-col gap-3 rounded-md border border-attention-foreground/30 bg-attention/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <Link href={`/lot/${encodeURIComponent(lot.lot_id)}`} className="font-medium underline-offset-4 hover:underline">
                    {lot.crop} · <span className="font-mono text-sm">{lot.lot_id}</span>
                  </Link>
                  <MoneyBlock base={lot.claims.holder} />
                </div>
                <ClaimButton lotId={lot.lot_id} kind="Holder" amount={lot.claims.holder} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("portfolio.claimEmpty")}</p>
        )}
      </section>

      <section aria-labelledby="held-title" className="flex flex-col gap-3">
        <h2 id="held-title" className="font-sans text-lg font-medium">
          {t("portfolio.heldTitle")}
        </h2>
        {held.length ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {held.map((lot) => (
              <li key={lot.lot_id} className="flex">
                <LotCard lot={lot} className="w-full">
                  {canTransfer(lot) ? <TransferNftButton lot={lot} /> : null}
                </LotCard>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Briefcase}
            title={t("portfolio.heldEmptyTitle")}
            body={t("portfolio.heldEmptyBody")}
            action={
              <Button asChild>
                <Link href="/market">{t("portfolio.browse")}</Link>
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
