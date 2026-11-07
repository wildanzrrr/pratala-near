import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export const apiKeys = { health: ["api", "health"] as const, me: ["api", "me"] as const };

/** Backend reachability; drives <ApiOfflineBanner/>. */
export function useApiHealth() {
  return useQuery({
    queryKey: apiKeys.health,
    queryFn: api.health,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
}
