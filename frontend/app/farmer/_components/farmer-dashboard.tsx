"use client";

import Link from "next/link";

import { MapPin, Plant, Plus } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import { Inbox } from "@/components/common/inbox";
import { SampleBanner } from "@/components/common/sample-banner";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { LotCard, LotCardSkeleton } from "@/components/lot/lot-card";
import { ClaimButton } from "@/components/money/claim-button";
import { MoneyBlock } from "@/components/money/money";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { formatArea } from "@/lib/near/format";
import { useLotsByFarmer } from "@/hooks/queries/use-lots-by-farmer";
import { usePlots } from "@/hooks/queries/use-plots";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

export function FarmerDashboard() {
  const { t } = useLocale();
  return (
    <PageBody>
      <PageHeader
        title={t("farmer.title")}
        lead={t("farmer.lead")}
        actions={
          <Button asChild size="lg">
            <Link href="/farmer/new">
              <Plus data-icon="inline-start" />
              {t("farmer.newLot")}
            </Link>
          </Button>
        }
      />
      <SampleBanner />
      <ConnectGate>
        <FarmerBody />
      </ConnectGate>
    </PageBody>
  );
}

function FarmerBody() {
  const { t, locale } = useLocale();
  const session = useSession();
  const lots = useLotsByFarmer(session.accountId);
  const plots = usePlots(session.accountId, session.signedInToApi);
  const claimable = (lots.data ?? []).filter((l) => l.status === "Settled" && l.claims.farmer !== "0");

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-8">
        {claimable.length ? (
          <section aria-labelledby="claim-title" className="flex flex-col gap-3">
            <h2 id="claim-title" className="font-sans text-lg font-medium">
              {t("farmer.claimableTitle")}
            </h2>
            <ul className="flex flex-col gap-3">
              {claimable.map((lot) => (
                <li key={lot.lot_id} className="flex flex-col gap-3 rounded-md border border-primary/40 bg-success/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <Link href={`/lot/${encodeURIComponent(lot.lot_id)}`} className="font-medium underline-offset-4 hover:underline">
                      {lot.crop} · <span className="font-mono text-sm">{lot.lot_id}</span>
                    </Link>
                    <MoneyBlock base={lot.claims.farmer} />
                  </div>
                  <ClaimButton lotId={lot.lot_id} kind="Farmer" amount={lot.claims.farmer} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="lots-title" className="flex flex-col gap-3">
          <h2 id="lots-title" className="font-sans text-lg font-medium">
            {t("farmer.lotsTitle")}
          </h2>
          {lots.isPending ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LotCardSkeleton />
              <LotCardSkeleton />
            </div>
          ) : lots.isError ? (
            <QueryErrorState error={lots.error} onRetry={() => lots.refetch()} />
          ) : !lots.data?.length ? (
            <EmptyState
              icon={Plant}
              title={t("farmer.lotsEmptyTitle")}
              body={t("farmer.lotsEmptyBody")}
              action={
                <Button asChild>
                  <Link href="/farmer/new">{t("farmer.newLot")}</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {lots.data.toSorted((a, b) => b.created_at_ms - a.created_at_ms).map((lot) => (
                <li key={lot.lot_id} className="flex">
                  <LotCard lot={lot} className="w-full" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-8">
        <ApiOfflineBanner />
        <Inbox />
        <section aria-labelledby="plots-title" className="flex flex-col gap-3">
          <h2 id="plots-title" className="flex items-center gap-2 font-sans text-lg font-medium">
            <MapPin aria-hidden className="size-5 text-muted-foreground" />
            {t("farmer.plotsTitle")}
          </h2>
          {plots.data?.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card text-sm">
              {plots.data.map((p) => (
                <li key={p.id} className="flex flex-col gap-0.5 p-3">
                  <span className="font-medium">{p.name}</span>
                  <span className="tnum text-muted-foreground">
                    {p.region} · {formatArea(p.areaM2, locale)} · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("farmer.plotsEmpty")}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
