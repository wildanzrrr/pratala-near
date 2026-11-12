"use client";

import { ProofLink, AccountLink } from "@/components/common/explorer-link";
import { formatDateTime, formatKg } from "@/lib/near/format";
import { useLotHistory } from "@/hooks/queries/use-lot-history";
import { useLocale } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

interface Hop {
  owner: string;
  label: string;
  at?: number | string | null;
  hash?: string | null;
}

/**
 * Who holds a piece of this harvest, and when they got it: the farmer minted the
 * certificate, each purchase minted a kg share NFT to its buyer, and share NFTs may
 * move on. With the API offline only the mint is known (buyers live in tx history).
 */
export function OwnershipHistory({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  const history = useLotHistory(lot.lot_id);

  const hops: Hop[] = [{ owner: lot.farmer_id, label: t("lot.ownershipMinted"), at: lot.created_at_ms }];
  for (const e of history.data ?? []) {
    const d = e.data as { buyer?: string; kg?: number; new_owner_id?: string; token_ids?: unknown };
    if (e.event === "lot_funded" && d.buyer) {
      hops.push({
        owner: d.buyer,
        label: t("lot.ownershipFunded", { kg: formatKg(d.kg ?? null) }),
        at: e.blockTimestamp,
        hash: e.txHash,
      });
    } else if (
      e.event === "nft_transfer" &&
      d.new_owner_id &&
      Array.isArray(d.token_ids) &&
      d.token_ids.some((id) => typeof id === "string" && id.includes(":"))
    ) {
      hops.push({ owner: d.new_owner_id, label: t("lot.ownershipTransferred"), at: e.blockTimestamp, hash: e.txHash });
    }
  }

  return (
    <section aria-labelledby="owner-title" className="flex flex-col gap-4">
      <h2 id="owner-title" className="text-2xl">
        {t("lot.ownership")}
      </h2>
      <ol className="flex flex-col gap-0">
        {hops.map((hop, i) => {
          const current = i === hops.length - 1;
          return (
            <li key={`${hop.owner}-${i}`} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
              <div className="flex flex-col items-center">
                <span className={current ? "mt-1.5 size-3 rounded-full bg-primary ring-4 ring-lime/50" : "mt-1.5 size-3 rounded-full border border-rule-strong bg-card"} />
                {!current ? <span aria-hidden className="w-px flex-1 bg-border" /> : null}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 pb-5">
                <AccountLink accountId={hop.owner} className="text-sm" />
                <span className="text-sm text-muted-foreground">
                  {current ? `${t("lot.ownershipNow")} · ` : ""}
                  {hop.label}
                  {hop.at ? ` · ${formatDateTime(hop.at, locale)}` : ""}
                </span>
                {hop.hash ? <ProofLink hash={hop.hash} className="text-xs" /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
