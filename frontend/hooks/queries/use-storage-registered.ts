import { useQuery } from "@tanstack/react-query";

import { STORAGE_DEPOSIT_FALLBACK, storageBalanceBounds, storageBalanceOf } from "@/lib/near/contracts";
import { pusdcKeys } from "@/hooks/queries/use-pusdc-balance";

/** Is the account registered on pUSDC (NEP-145)? Payouts and refunds need it. */
export function useStorageRegistered(accountId: string | null | undefined) {
  return useQuery({
    queryKey: pusdcKeys.storage(accountId ?? ""),
    queryFn: async () => (await storageBalanceOf(accountId!)) !== null,
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });
}

/** storage_balance_bounds.min, with the documented ≈ 0.00125 NEAR fallback. */
export function useStorageDeposit() {
  return useQuery({
    queryKey: pusdcKeys.bounds,
    queryFn: async () => (await storageBalanceBounds()).min,
    staleTime: Infinity,
    placeholderData: STORAGE_DEPOSIT_FALLBACK,
  });
}
