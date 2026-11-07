import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export const plotKeys = { mine: (accountId: string) => ["plots", "mine", accountId] as const };

export function usePlots(accountId: string | null | undefined, signedInToApi: boolean) {
  return useQuery({
    queryKey: plotKeys.mine(accountId ?? ""),
    queryFn: api.myPlots,
    enabled: Boolean(accountId) && signedInToApi,
    retry: false,
  });
}
