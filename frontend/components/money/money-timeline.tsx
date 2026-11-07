"use client";

import { ArrowDownRight, Coins, LockSimple, Scales } from "@phosphor-icons/react";

import { ProofLink } from "@/components/common/explorer-link";
import { Money } from "@/components/money/money";
import { formatDateTime, settlementPreview, shortAccount } from "@/lib/near/format";
import { cn } from "@/lib/utils";
import { useLotHistory } from "@/hooks/queries/use-lot-history";
import { useLocale } from "@/providers/locale-provider";

import type { Icon } from "@phosphor-icons/react";
import type { LotEvent, LotView } from "@/lib/near/types";

interface Row {
  key: string;
  icon: Icon;
  title: string;
  detail?: string;
  amount?: string;
  at?: number | string | null;
  hash?: string | null;
  done: boolean;
  tone?: "farmer" | "holder" | "muted";
}

const hashFor = (events: LotEvent[] | undefined, name: string, match?: (e: LotEvent) => boolean) =>
  events?.find((e) => e.event === name && (!match || match(e)))?.txHash ?? null;

/**
 * Funding → escrow → settlement → claims, from chain state; tx links are added
 * from the indexer history when the API is up.
 */
export function MoneyTimeline({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  const history = useLotHistory(lot.lot_id);
  const events = history.data;
  const funded = lot.funded_at_ms !== null;
  const settled = lot.status === "Settled";
  const refunded = lot.status === "Refunded";

  const split =
    settled && lot.actual_kg !== null
      ? settlementPreview({
          actualKg: lot.actual_kg,
          projectedKg: lot.projected_kg,
          pricePerKg: lot.price_per_kg,
          escrow: lot.funding_total,
          feeBps: lot.fee_bps,
        })
      : null;

  const claimRow = (kind: "farmer" | "holder" | "treasury", initial: string | null): Row => {
    const remaining = lot.claims[kind];
    const claimed = initial !== null && remaining === "0" && initial !== "0";
    const label = kind === "farmer" ? "money.farmerClaim" : kind === "holder" ? "money.holderClaim" : "money.treasuryClaim";
    return {
      key: kind,
      icon: ArrowDownRight,
      title: t(label),
      detail: claimed ? t("money.claimed") : t("money.remaining"),
      amount: claimed ? (initial ?? remaining) : remaining,
      hash: hashFor(events, "payout_claimed", (e) => String((e.data as { kind?: string }).kind ?? "").toLowerCase() === kind),
      done: claimed,
      tone: kind === "farmer" ? "farmer" : kind === "holder" ? "holder" : "muted",
    };
  };

  const rows: Row[] = [
    {
      key: "funding",
      icon: Coins,
      title: t("money.funding"),
      detail: lot.funder ? t("money.fundedBy", { account: shortAccount(lot.funder) }) : t("money.notYet"),
      amount: funded ? lot.funding_total : undefined,
      at: lot.funded_at_ms,
      hash: hashFor(events, "lot_funded"),
      done: funded,
    },
    {
      key: "escrow",
      icon: LockSimple,
      title: t("money.escrow"),
      amount: lot.status === "Funded" ? lot.escrow : undefined,
      detail: lot.status === "Funded" ? undefined : funded ? t("money.claimed") : t("money.notYet"),
      done: funded,
    },
    {
      key: "settlement",
      icon: Scales,
      title: refunded ? t("status.Refunded") : t("money.settlement"),
      at: lot.settled_at_ms,
      hash: hashFor(events, refunded ? "lot_refunded" : "lot_settled"),
      done: settled || refunded,
    },
  ];

  if (settled) {
    rows.push(claimRow("farmer", split?.farmer ?? null), claimRow("holder", split?.holder ?? null), claimRow("treasury", split?.treasury ?? null));
  } else if (refunded) {
    rows.push(claimRow("holder", lot.funding_total));
  }

  return (
    <section aria-labelledby="money-title" className="flex flex-col gap-4">
      <h2 id="money-title" className="text-2xl">
        {t("money.timelineTitle")}
      </h2>
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap">
            <row.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", row.done ? "text-primary" : "text-muted-foreground")} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("font-medium", !row.done && "text-muted-foreground")}>{row.title}</span>
              <span className="text-sm text-muted-foreground">
                {[row.detail, row.at ? formatDateTime(row.at, locale) : null].filter(Boolean).join(" · ")}
              </span>
              {row.hash ? <ProofLink hash={row.hash} className="mt-1 text-xs" /> : null}
            </div>
            {row.amount ? (
              <Money
                base={row.amount}
                className={cn(
                  "ml-8 text-base sm:ml-0",
                  row.tone === "farmer" && "text-primary",
                  row.tone === "holder" && "text-attention-foreground",
                )}
              />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{t("money.ledgerSoon")}</p>
    </section>
  );
}
