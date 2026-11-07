import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export const orderKeys = { mine: (accountId: string) => ["orders", "mine", accountId] as const };

export function useOrders(accountId: string | null | undefined, signedInToApi: boolean) {
  return useQuery({
    queryKey: orderKeys.mine(accountId ?? ""),
    queryFn: api.myOrders,
    enabled: Boolean(accountId) && signedInToApi,
    retry: false,
  });
}
