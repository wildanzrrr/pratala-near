"use client";

import Link from "next/link";

import { MagnifyingGlass } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import { SampleBanner } from "@/components/common/sample-banner";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { StatusStepper } from "@/components/lot/status-stepper";
import { MoneyTimeline } from "@/components/money/money-timeline";
import { TrustPanel } from "@/components/trust/trust-panel";
import { FundingPanel } from "@/app/lot/[id]/_components/funding-panel";
import { LotDetailSkeleton } from "@/app/lot/[id]/_components/lot-detail-skeleton";
import { LotHeader } from "@/app/lot/[id]/_components/lot-header";
import { OwnershipHistory } from "@/app/lot/[id]/_components/ownership-history";
import { useLot } from "@/hooks/queries/use-lot";
import { useT } from "@/providers/locale-provider";

export function LotDetail({ lotId }: { lotId: string }) {
  const t = useT();
  const lot = useLot(lotId);

  if (lot.isPending) return <LotDetailSkeleton />;
  if (lot.isError) {
    return (
      <div className="page-max page-x py-12">
        <QueryErrorState error={lot.error} onRetry={() => lot.refetch()} />
      </div>
    );
  }
  if (!lot.data) {
    return (
      <div className="page-max page-x py-12">
        <EmptyState
          icon={MagnifyingGlass}
          title={t("lot.notFoundTitle")}
          body={t("lot.notFoundBody")}
          action={
            <Button asChild variant="outline">
              <Link href="/market">{t("nav.market")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const data = lot.data;
  return (
    <div className="page-max page-x flex flex-col gap-8 py-8 sm:py-12">
      <SampleBanner />
      <LotHeader lot={data} />
      <div className="rounded-md border border-border bg-card p-4">
        <StatusStepper status={data.status} />
      </div>
      <ApiOfflineBanner />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
        <aside className="order-first lg:order-last">
          <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--pt-bar-h)+1.5rem)]">
            <FundingPanel lot={data} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-12">
          <TrustPanel lot={data} />
          <MoneyTimeline lot={data} />
          <OwnershipHistory lot={data} />
        </div>
      </div>
    </div>
  );
}
