import { useQuery } from "@tanstack/react-query";

import { ftBalanceOf } from "@/lib/near/contracts";

export const pusdcKeys = {
  all: ["pusdc"] as const,
  balance: (accountId: string) => ["pusdc", "balance", accountId] as const,
  storage: (accountId: string) => ["pusdc", "storage", accountId] as const,
  bounds: ["pusdc", "bounds"] as const,
};

export function usePusdcBalance(accountId: string | null | undefined) {
  return useQuery({
    queryKey: pusdcKeys.balance(accountId ?? ""),
    queryFn: () => ftBalanceOf(accountId!),
    enabled: Boolean(accountId),
    staleTime: 10_000,
  });
}
