"use client";

import { AccountLink } from "@/components/common/explorer-link";
import { NextStepHint, StatusBadge } from "@/components/lot/status-badge";
import { ShareButton } from "@/components/lot/share-button";
import { formatArea, formatKg, formatMonth } from "@/lib/near/format";
import { useLocale } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

export function LotHeader({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  const facts = [
    { k: t("lot.projected"), v: formatKg(lot.projected_kg, locale) },
    { k: t("lot.harvest"), v: formatMonth(lot.harvest_month, locale) },
    { k: t("lot.area"), v: formatArea(lot.area_m2, locale) },
    { k: t("lot.region"), v: lot.region },
  ];
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{lot.lot_id}</span>
          <StatusBadge status={lot.status} />
        </div>
        <ShareButton title={`${lot.crop} · ${lot.lot_id}`} path={`/lot/${encodeURIComponent(lot.lot_id)}`} />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl sm:text-5xl">
          {lot.crop}
          {lot.variety ? <span className="text-muted-foreground"> · {lot.variety}</span> : null}
        </h1>
        <NextStepHint status={lot.status} />
      </div>
      <dl className="tnum grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
        {facts.map((f) => (
          <div key={f.k} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{f.k}</dt>
            <dd className="truncate">{f.v}</dd>
          </div>
        ))}
        <div className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-4">
          <dt className="text-xs text-muted-foreground">{t("lot.farmer")}</dt>
          <dd className="min-w-0">
            <AccountLink accountId={lot.farmer_id} />
          </dd>
        </div>
      </dl>
    </header>
  );
}
