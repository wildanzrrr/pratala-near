"use client";

import Link from "next/link";

import { ArrowLeft } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SampleBanner } from "@/components/common/sample-banner";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { PageBody } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/lot/status-badge";
import { MoneyBlock } from "@/components/money/money";
import { IntentsTab } from "@/app/checkout/[id]/_components/intents-tab";
import { PusdcTab } from "@/app/checkout/[id]/_components/pusdc-tab";
import { formatKg } from "@/lib/near/format";
import { useLot } from "@/hooks/queries/use-lot";
import { useLocale } from "@/providers/locale-provider";

export function CheckoutView({ lotId }: { lotId: string }) {
  const { t, locale } = useLocale();
  const lot = useLot(lotId);

  if (lot.isPending) return <PageBody><Skeleton className="h-96 w-full" /></PageBody>;
  if (lot.isError) return <PageBody><QueryErrorState error={lot.error} onRetry={() => lot.refetch()} /></PageBody>;
  if (!lot.data) return <PageBody><EmptyState title={t("lot.notFoundTitle")} body={t("lot.notFoundBody")} /></PageBody>;
  const data = lot.data;

  return (
    <PageBody className="max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={`/lot/${encodeURIComponent(data.lot_id)}`}>
          <ArrowLeft data-icon="inline-start" />
          {data.lot_id}
        </Link>
      </Button>
      <SampleBanner />
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl sm:text-4xl">{t("checkout.title")}</h1>
          <p className="flex flex-wrap items-center gap-2 text-ink-2">
            {data.crop}
            {data.variety ? ` · ${data.variety}` : ""} · {formatKg(data.projected_kg, locale)} · {data.region}
            <StatusBadge status={data.status} />
          </p>
        </div>
        <MoneyBlock base={data.funding_total} size="lg" />
      </header>
      {data.status !== "Listed" ? (
        <EmptyState title={t("checkout.notListed")} body={t(`status.next_${data.status}`)} />
      ) : (
        <Tabs defaultValue="pusdc" className="gap-6">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="pusdc">{t("checkout.tabPusdc")}</TabsTrigger>
            <TabsTrigger value="intents">{t("checkout.tabIntents")}</TabsTrigger>
          </TabsList>
          <TabsContent value="pusdc">
            <PusdcTab lot={data} />
          </TabsContent>
          <TabsContent value="intents">
            <IntentsTab lot={data} />
          </TabsContent>
        </Tabs>
      )}
    </PageBody>
  );
}
