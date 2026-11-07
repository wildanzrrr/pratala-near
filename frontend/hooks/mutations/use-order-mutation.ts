"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { explorer } from "@/lib/explorer";
import { tx, txHashOf } from "@/lib/near/contracts";
import { WalletRejectedError, classifyTxError } from "@/lib/near/errors";
import { orderKeys } from "@/hooks/queries/use-orders";
import { pusdcKeys } from "@/hooks/queries/use-pusdc-balance";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

import type { InputListing } from "@/lib/near/types";

/** Farm-input purchase: POST /orders (memo) → ft_transfer to the seller with the memo → confirm with tx hash. */
export function useOrderMutation() {
  const { signedAccountId, signAndSendTransaction } = useNear();
  const queryClient = useQueryClient();
  const t = useT();
  return useMutation<{ hash: string | null }, Error, { listing: InputListing; qty: number }>({
    mutationFn: async ({ listing, qty }) => {
      const order = await api.createOrder({ listingId: listing.id, qty });
      toast.message(t("market.orderCreated"));
      let outcome: unknown;
      try {
        outcome = await signAndSendTransaction(tx.ftTransfer(order.sellerId, order.amount, order.memo));
      } catch (error) {
        throw classifyTxError(error);
      }
      const hash = txHashOf(outcome);
      if (hash) {
        await api.confirmOrder(order.id, hash).catch(() => undefined);
        api.postTx({ txHash: hash, signerId: signedAccountId, context: { orderId: order.id } }).catch(() => undefined);
      }
      return { hash };
    },
    onSuccess: async ({ hash }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.mine(signedAccountId) }),
        queryClient.invalidateQueries({ queryKey: pusdcKeys.balance(signedAccountId) }),
      ]);
      toast.success(t("market.orderPaid"), {
        action: hash ? { label: t("common.viewProof"), onClick: () => window.open(explorer.tx(hash), "_blank", "noopener") } : undefined,
      });
    },
    onError: (e) => (e instanceof WalletRejectedError ? toast.message(t("tx.rejected")) : toast.error(e.message)),
  });
}
