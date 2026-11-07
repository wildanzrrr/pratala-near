"use client";

import { useEffect, useRef } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { explorer } from "@/lib/explorer";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

/**
 * Redirect wallets (MyNearWallet & co.) come back with
 * `?transactionHashes=<a,b>` or `?errorCode=userRejected`. Toast the outcome,
 * hint the indexer, refresh every query, then clean the URL.
 */
export function TxRedirectHandler() {
  const { signedAccountId, loading } = useNear();
  const queryClient = useQueryClient();
  const t = useT();
  const handled = useRef(false);

  useEffect(() => {
    if (loading || handled.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const hashes = url.searchParams.get("transactionHashes");
    const errorCode = url.searchParams.get("errorCode");
    if (!hashes && !errorCode) return;
    handled.current = true;

    if (errorCode) {
      toast.message(t("tx.rejected"));
    } else if (hashes) {
      const list = hashes.split(",").filter(Boolean);
      const last = list.at(-1)!;
      for (const txHash of list) {
        if (signedAccountId) api.postTx({ txHash, signerId: signedAccountId }).catch(() => undefined);
      }
      void queryClient.invalidateQueries();
      toast.success(t("tx.returned"), {
        action: { label: t("common.viewProof"), onClick: () => window.open(explorer.tx(last), "_blank", "noopener") },
      });
    }

    for (const key of ["transactionHashes", "errorCode", "errorMessage", "account_id", "public_key", "all_keys"]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [loading, signedAccountId, queryClient, t]);

  return null;
}
