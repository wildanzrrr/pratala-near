"use client";

import { storageBalanceOf, tx } from "@/lib/near/contracts";
import { pusdcKeys } from "@/hooks/queries/use-pusdc-balance";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

/** One tx to pUSDC: storage_deposit (only if unregistered) + faucet(1,000 pUSDC). */
export function useFaucetMutation() {
  return useTxMutation<{ storageDeposit: string; amount?: string }>({
    build: async (v, accountId) => {
      const registered = (await storageBalanceOf(accountId).catch(() => null)) !== null;
      return tx.faucet({ accountId, registered, storageDeposit: v.storageDeposit, amount: v.amount });
    },
    success: "tx.faucet",
    invalidate: (_v, a) => [pusdcKeys.balance(a), pusdcKeys.storage(a)],
  });
}

/** storage_deposit alone — needed before a payout/refund can land. */
export function useStorageDepositMutation() {
  return useTxMutation<{ storageDeposit: string }>({
    build: (v, accountId) => tx.storageDeposit(accountId, v.storageDeposit),
    success: "tx.storage",
    invalidate: (_v, a) => [pusdcKeys.storage(a)],
  });
}
