"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

/** nft_transfer (1 yocto) — the claim on any refund moves with the token. */
export function useNftTransferMutation(onDone?: () => void) {
  return useTxMutation<{ lotId: string; receiverId: string }>({
    build: (v) => tx.nftTransfer(v.receiverId, v.lotId),
    success: "tx.transferred",
    invalidate: (v, a) => [lotKeys.detail(v.lotId), lotKeys.forHolder(a), lotKeys.forHolder(v.receiverId)],
    context: (v) => ({ lotId: v.lotId }),
    onSuccess: () => onDone?.(),
  });
}
