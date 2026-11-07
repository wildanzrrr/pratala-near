"use client";

import { LockSimple } from "@phosphor-icons/react";

import { AccountLink } from "@/components/common/explorer-link";
import { MoneyBlock } from "@/components/money/money";
import { formatDate } from "@/lib/near/format";
import { useLocale } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

/** "Held in contract" — the reassurance a funded lot owes both sides. */
export function EscrowPanel({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 font-sans text-base font-medium">
        <LockSimple aria-hidden weight="bold" className="size-4 text-primary" />
        {t("money.escrowTitle")}
      </h3>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("money.escrowAmount")}</span>
        <MoneyBlock base={lot.escrow} size="lg" />
      </div>
      <p className="text-sm text-ink-2">{t("money.escrowBody")}</p>
      {lot.funder ? (
        <p className="text-sm text-muted-foreground">
          {t("money.fundedBy", { account: "" })}
          <AccountLink accountId={lot.funder} />
          {lot.funded_at_ms ? ` ${t("money.fundedAt", { date: formatDate(lot.funded_at_ms, locale) })}` : null}
        </p>
      ) : null}
    </div>
  );
}
