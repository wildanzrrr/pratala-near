"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { SampleBadge } from "@/components/common/sample-banner";
import { formatNumber, formatUsdc } from "@/lib/near/format";
import { ChainUnavailableError, isNotDeployed } from "@/lib/near/errors";
import { useStats } from "@/hooks/queries/use-stats";
import { useLocale } from "@/providers/locale-provider";

import type { MessageKey } from "@/lib/i18n/types";

/** T4 · stat strip — live get_stats only; "—" until the contract has data. Never invented. */
export function LiveStats() {
  const { t, locale } = useLocale();
  const stats = useStats();
  const s = stats.data;
  const dash = "—";
  const cells: Array<{ value: string; label: MessageKey }> = [
    { value: s ? formatNumber(s.total_lots, locale) : dash, label: "landing.statTotal" },
    { value: s ? formatNumber(s.verified_lots, locale) : dash, label: "landing.statVerified" },
    { value: s ? formatNumber(s.funded_lots, locale) : dash, label: "landing.statFunded" },
    { value: s ? formatNumber(s.settled_lots, locale) : dash, label: "landing.statSettled" },
    { value: s ? formatUsdc(s.farmer_paid, locale) : dash, label: "landing.statPaid" },
  ];
  const note = isNotDeployed(stats.error)
    ? t("landing.statsNotDeployed")
    : stats.error instanceof ChainUnavailableError
      ? t("landing.statsOffline")
      : null;

  return (
    <section aria-labelledby="stats-title" className="border-y border-border bg-card">
      <div className="page-max page-x flex flex-col gap-6 py-10">
        <div className="flex flex-col gap-2">
          <h2 id="stats-title" className="flex flex-wrap items-center gap-3 text-xl">
            {t("landing.statsTitle")}
            <SampleBadge />
          </h2>
          <p className="measure text-sm text-muted-foreground">{note ?? t("landing.statsLead")}</p>
        </div>
        <dl className="tnum grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {cells.map((cell) => (
            <div key={cell.label} className="flex min-w-0 flex-col gap-1 border-l border-border pl-4">
              <dt className="order-2 text-sm text-muted-foreground">{t(cell.label)}</dt>
              <dd className="order-1 font-mono text-2xl text-foreground sm:text-3xl">
                {stats.isPending ? <Skeleton className="h-8 w-16" /> : cell.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
