"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { pusdcKeys } from "@/hooks/queries/use-pusdc-balance";
import { statsKeys } from "@/hooks/queries/use-stats";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

import type { TxResult } from "@/hooks/mutations/use-tx-mutation";

/** Funding = ft_transfer_call on pUSDC (1 yocto) → always a wallet approval. */
export function useFundLotMutation(onFunded?: (result: TxResult) => void) {
  return useTxMutation<{ lotId: string; amount: string }>({
    build: (v) => tx.fundLot(v.lotId, v.amount),
    success: "tx.funded",
    invalidate: (v, a) => [lotKeys.detail(v.lotId), lotKeys.forHolder(a), lotKeys.all, pusdcKeys.balance(a), statsKeys.all],
    context: (v) => ({ lotId: v.lotId }),
    onSuccess: (result) => onFunded?.(result),
  });
}
