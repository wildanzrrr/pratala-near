"use client";

import { tx } from "@/lib/near/contracts";
import { pusdcKeys } from "@/hooks/queries/use-pusdc-balance";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

/** storage_deposit alone — needed before a payout/refund can land. */
export function useStorageDepositMutation() {
  return useTxMutation<{ storageDeposit: string }>({
    build: (v, accountId) => tx.storageDeposit(accountId, v.storageDeposit),
    success: "tx.storage",
    invalidate: (_v, a) => [pusdcKeys.storage(a)],
  });
}
