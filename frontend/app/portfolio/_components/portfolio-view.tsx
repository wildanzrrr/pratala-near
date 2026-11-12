"use client";

import Link from "next/link";

import { Briefcase, DownloadSimple } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SampleBanner } from "@/components/common/sample-banner";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { TransferNftButton } from "@/components/lot/transfer-nft-dialog";
import { ClaimButton } from "@/components/money/claim-button";
import { MoneyBlock } from "@/components/money/money";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { api } from "@/lib/api";
import { canTransferShare } from "@/lib/near/contracts";
import { formatKg } from "@/lib/near/format";
import { useLot } from "@/hooks/queries/use-lot";
import { useSharesForOwner } from "@/hooks/queries/use-shares-for-owner";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { ShareView } from "@/lib/near/types";

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
  const shares = useSharesForOwner(signedAccountId);

  if (shares.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (shares.isError) return <QueryErrorState error={shares.error} onRetry={() => shares.refetch()} />;

  const all = shares.data ?? [];
  const claimable = all.filter((s) => !s.claimed && s.entitlement !== "0");
  const rest = all.filter((s) => !claimable.includes(s));

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="claim-title" className="flex flex-col gap-3">
        <h2 id="claim-title" className="font-sans text-lg font-medium">
          {t("portfolio.claimTitle")}
        </h2>
        {claimable.length ? (
          <ul className="flex flex-col gap-3">
            {claimable.map((share) => (
              <li key={share.share_id}>
                <ShareRow share={share} claimable />
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
        {rest.length ? (
          <ul className="flex flex-col gap-3">
            {rest.map((share) => (
              <li key={share.share_id}>
                <ShareRow share={share} />
              </li>
            ))}
          </ul>
        ) : all.length === 0 ? (
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
        ) : null}
      </section>
    </div>
  );
}

/** One kg share NFT with its lot: crop header, kg, refund claim or transfer. */
function ShareRow({ share, claimable = false }: { share: ShareView; claimable?: boolean }) {
  const { t } = useLocale();
  const lot = useLot(share.lot_id);
  const view = lot.data;

  return (
    <div
      className={
        claimable
          ? "flex flex-col gap-3 rounded-md border border-attention-foreground/30 bg-attention/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          : "flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/lot/${encodeURIComponent(share.lot_id)}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {view ? view.crop : share.lot_id} · <span className="font-mono text-sm">{share.share_id}</span>
        </Link>
        <p className="text-sm text-muted-foreground">
          {t("portfolio.shareKg", { kg: formatKg(share.kg) })}
          {share.claimed ? ` · ${t("portfolio.shareClaimed")}` : ""}
        </p>
        {claimable ? <MoneyBlock base={share.entitlement} /> : null}
      </div>
      {view ? (
        claimable ? (
          <ClaimButton lotId={share.lot_id} shareId={share.share_id} kind="Holder" amount={share.entitlement} />
        ) : canTransferShare(view) ? (
          <TransferNftButton lot={view} tokenId={share.share_id} label={t("portfolio.transferShare")} />
        ) : view.claim_lock ? (
          <p className="text-xs text-muted-foreground">{t("lot.lockedNote")}</p>
        ) : null
      ) : (
        <Skeleton className="h-10 w-32" />
      )}
    </div>
  );
}
