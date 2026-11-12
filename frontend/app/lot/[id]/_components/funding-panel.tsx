"use client";

import Link from "next/link";

import { ArrowRight, ClockCountdown } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { NextStepHint } from "@/components/lot/status-badge";
import { TransferNftButton } from "@/components/lot/transfer-nft-dialog";
import { ClaimButton } from "@/components/money/claim-button";
import { EscrowPanel } from "@/components/money/escrow-panel";
import { Money, MoneyBlock } from "@/components/money/money";
import { FarmerActions } from "@/app/lot/[id]/_components/farmer-actions";
import { formatKg, formatUsdc } from "@/lib/near/format";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

/** Right rail of the pay link: what this viewer can do with this lot right now. */
export function FundingPanel({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  const session = useSession();
  const me = session.accountId;
  const isFarmer = me === lot.farmer_id;
  const isTreasury = Boolean(me && (session.isAdmin || session.config?.treasury === me));
  const open = lot.status === "Listed";

  return (
    <div className="flex flex-col gap-4">
      {lot.status === "Listed" || lot.price_per_kg !== "0" ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-sans text-base font-medium">{t("money.fundingTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("money.pricePerKg", { price: formatUsdc(lot.price_per_kg, locale, 2) })}</p>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("lot.total")}</span>
            <MoneyBlock base={lot.funding_total} size="lg" />
          </div>
          {lot.projected_kg > 0 && (lot.sold_kg > 0 || !open) ? (
            <div className="flex flex-col gap-1.5" aria-label={t("lot.soldProgress")}>
              <div className="h-2 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuemin={0} aria-valuemax={lot.projected_kg} aria-valuenow={lot.sold_kg}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((lot.sold_kg / lot.projected_kg) * 100))}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("lot.soldProgress", { sold: formatKg(lot.sold_kg, locale), total: formatKg(lot.projected_kg, locale) })}
                {lot.share_count > 0 ? ` · ${t("lot.buyers", { count: String(lot.share_count) })}` : ""}
              </p>
            </div>
          ) : null}
          {open && !isFarmer && lot.remaining_kg > 0 ? (
            <Button asChild size="lg" className="w-full">
              <Link href={`/checkout/${encodeURIComponent(lot.lot_id)}`}>
                {t("lot.fund")}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-rule-strong bg-card/60 p-4">
          <p className="flex items-center gap-2 font-medium">
            <ClockCountdown aria-hidden className="size-4 text-muted-foreground" />
            {t("lot.fundDisabled")}
          </p>
          <NextStepHint status={lot.status} />
        </div>
      )}

      {lot.status === "Funded" ? <EscrowPanel lot={lot} /> : null}

      {lot.status === "Settled" || lot.status === "Refunded" ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-sans text-base font-medium">{t("money.splitTitle")}</h2>
          <ClaimLine label={t("money.farmerClaim")} amount={lot.claims.farmer} />
          <ClaimLine label={t("money.holderClaim")} amount={lot.claims.holder} />
          <ClaimLine label={t("money.treasuryClaim")} amount={lot.claims.treasury} />
          {(isFarmer && lot.claims.farmer !== "0") || (isTreasury && lot.claims.treasury !== "0") ? <Separator /> : null}
          {isFarmer && lot.claims.farmer !== "0" ? <ClaimButton lotId={lot.lot_id} kind="Farmer" amount={lot.claims.farmer} /> : null}
          {isTreasury && lot.claims.treasury !== "0" ? <ClaimButton lotId={lot.lot_id} kind="Treasury" amount={lot.claims.treasury} /> : null}
          {lot.claims.holder !== "0" ? <p className="text-xs text-muted-foreground">{t("lot.shareClaimsNote")}</p> : null}
        </div>
      ) : null}

      {isFarmer && ["Funded", "Settled", "Refunded"].includes(lot.status) ? (
        <div className="flex flex-col gap-2">
          <TransferNftButton lot={lot} />
          {lot.claim_lock ? <p className="text-xs text-muted-foreground">{t("lot.lockedNote")}</p> : null}
        </div>
      ) : null}

      {isFarmer ? <FarmerActions lot={lot} /> : null}
    </div>
  );
}

function ClaimLine({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <Money base={amount} />
    </div>
  );
}
