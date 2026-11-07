"use client";

import Link from "next/link";

import { MapPin, Scales, CalendarBlank } from "@phosphor-icons/react";

import { Skeleton } from "@/components/ui/skeleton";
import { SampleBadge } from "@/components/common/sample-banner";
import { NextStepHint, StatusBadge } from "@/components/lot/status-badge";
import { Money, Rupiah } from "@/components/money/money";
import { formatKg, formatMonth } from "@/lib/near/format";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";

import type { ReactNode } from "react";
import type { LotView } from "@/lib/near/types";

/**
 * Compound lot card. The title is a stretched link to the pay link page;
 * `<LotCardActions>` sit above the link layer so buttons stay real buttons.
 */
export function LotCard({ lot, children, className }: { lot: LotView; children?: ReactNode; className?: string }) {
  const { t, locale } = useLocale();
  const priced = lot.price_per_kg !== "0";
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-md border border-border bg-card p-4 transition-[border-color,box-shadow] duration-(--pt-dur-short) ease-(--pt-ease-out)",
        "focus-within:border-primary/60 hover:border-primary/40 hover:shadow-(--pt-shadow-whisper)",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">{lot.lot_id}</span>
          <h3 className="font-sans text-lg leading-snug font-medium">
            <Link
              href={`/lot/${encodeURIComponent(lot.lot_id)}`}
              className="outline-none after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {lot.crop}
              {lot.variety ? <span className="text-muted-foreground"> · {lot.variety}</span> : null}
            </Link>
          </h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={lot.status} />
          <SampleBadge />
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-1.5 text-sm text-ink-2 min-[360px]:grid-cols-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <dt className="sr-only">{t("lot.region")}</dt>
          <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <dd className="truncate">{lot.region}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{t("lot.projected")}</dt>
          <Scales aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <dd className="tnum">{formatKg(lot.actual_kg ?? lot.projected_kg, locale)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{t("lot.harvest")}</dt>
          <CalendarBlank aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <dd>{formatMonth(lot.harvest_month, locale)}</dd>
        </div>
      </dl>

      <footer className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
        {priced ? (
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t("lot.total")}</span>
            <Money base={lot.funding_total} className="text-base" />
            <Rupiah base={lot.funding_total} className="text-xs" />
          </div>
        ) : (
          <NextStepHint status={lot.status} />
        )}
        {children ? <div className="relative z-[1] flex flex-wrap gap-2">{children}</div> : null}
      </footer>
    </article>
  );
}

export function LotCardSkeleton() {
  return <Skeleton className="h-52 w-full rounded-md" />;
}
