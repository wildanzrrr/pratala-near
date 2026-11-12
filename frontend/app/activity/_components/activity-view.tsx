"use client";

import { useMemo } from "react";

import Link from "next/link";

import { Coins, Plant, Pulse, Scales, SealCheck } from "@phosphor-icons/react";

import { Skeleton } from "@/components/ui/skeleton";
import { SampleBanner } from "@/components/common/sample-banner";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { formatDateTime, formatKg, shortAccount } from "@/lib/near/format";
import { useLots } from "@/hooks/queries/use-lots";
import { useLocale } from "@/providers/locale-provider";

import type { Icon } from "@phosphor-icons/react";
import type { LotView } from "@/lib/near/types";

interface FeedItem {
  key: string;
  at: number;
  icon: Icon;
  text: string;
  lotId: string;
}

const KIND_KEY = { FieldVisit: "trust.layer1", CoopReview: "trust.layer2", WarehouseWeighIn: "trust.layer3", CropFailure: "trust.failure" } as const;

/**
 * Public transparency feed derived from chain state alone (lot timestamps and
 * signed attestations), so it works with the API offline. Newest first.
 */
export function ActivityView() {
  const { t, locale } = useLocale();
  const lots = useLots();

  const feed = useMemo(() => {
    const items: FeedItem[] = [];
    for (const lot of lots.data ?? ([] as LotView[])) {
      items.push({
        key: `${lot.lot_id}-reg`,
        at: lot.created_at_ms,
        icon: Plant,
        lotId: lot.lot_id,
        text: t("activity.registered", { farmer: shortAccount(lot.farmer_id), lot: lot.lot_id, crop: lot.crop, kg: formatKg(lot.projected_kg, locale) }),
      });
      for (const a of lot.attestations) {
        if (a.kind === "WarehouseWeighIn") continue;
        items.push({
          key: `${lot.lot_id}-${a.kind}-${a.timestamp_ms}`,
          at: a.timestamp_ms,
          icon: SealCheck,
          lotId: lot.lot_id,
          text: t("activity.attested", { signer: shortAccount(a.signer), kind: t(KIND_KEY[a.kind]), lot: lot.lot_id }),
        });
      }
      if (lot.funded_at_ms && lot.share_count > 0) {
        items.push({
          key: `${lot.lot_id}-fund`,
          at: lot.funded_at_ms,
          icon: Coins,
          lotId: lot.lot_id,
          text: t("activity.funded", { count: String(lot.share_count), kg: formatKg(lot.sold_kg, locale), lot: lot.lot_id }),
        });
      }
      if (lot.settled_at_ms && lot.actual_kg !== null) {
        items.push({ key: `${lot.lot_id}-settle`, at: lot.settled_at_ms, icon: Scales, lotId: lot.lot_id, text: t("activity.settled", { lot: lot.lot_id, kg: formatKg(lot.actual_kg, locale) }) });
      }
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 100);
  }, [lots.data, t, locale]);

  return (
    <PageBody className="max-w-3xl">
      <PageHeader title={t("activity.title")} lead={t("activity.lead")} />
      <SampleBanner />
      {lots.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : lots.isError ? (
        <QueryErrorState error={lots.error} onRetry={() => lots.refetch()} />
      ) : !feed.length ? (
        <EmptyState icon={Pulse} title={t("activity.empty")} />
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {feed.map((item) => (
            <li key={item.key} className="flex gap-3 p-4">
              <item.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/lot/${encodeURIComponent(item.lotId)}`} className="text-sm underline-offset-4 hover:underline">
                  {item.text}
                </Link>
                <time dateTime={new Date(item.at).toISOString()} className="text-xs text-muted-foreground">
                  {formatDateTime(item.at, locale)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PageBody>
  );
}
