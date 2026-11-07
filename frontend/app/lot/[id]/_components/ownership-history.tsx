"use client";

import { ProofLink, AccountLink } from "@/components/common/explorer-link";
import { formatDateTime } from "@/lib/near/format";
import { useLotHistory } from "@/hooks/queries/use-lot-history";
import { useLocale } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

interface Hop {
  owner: string;
  label: string;
  at?: number | string | null;
  hash?: string | null;
}

/** Who held the NFT, and when — the reason a refund lands with today's holder. */
export function OwnershipHistory({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  const history = useLotHistory(lot.lot_id);

  let hops: Hop[];
  const transfers = (history.data ?? []).filter((e) => e.event === "nft_transfer" || e.event === "lot_funded");
  if (transfers.length) {
    hops = [
      { owner: lot.farmer_id, label: t("lot.ownershipMinted"), at: lot.created_at_ms },
      ...transfers.map((e) => {
        const d = e.data as { new_owner_id?: string; funder?: string };
        return {
          owner: d.new_owner_id ?? d.funder ?? e.signerId,
          label: e.event === "lot_funded" ? t("lot.ownershipFunded") : t("lot.ownershipTransferred"),
          at: e.blockTimestamp,
          hash: e.txHash,
        };
      }),
    ];
  } else {
    hops = [{ owner: lot.farmer_id, label: t("lot.ownershipMinted"), at: lot.created_at_ms }];
    if (lot.funder) hops.push({ owner: lot.funder, label: t("lot.ownershipFunded"), at: lot.funded_at_ms });
    if (lot.holder !== (lot.funder ?? lot.farmer_id)) hops.push({ owner: lot.holder, label: t("lot.ownershipTransferred") });
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
