import { useQuery } from "@tanstack/react-query";

import { api, isUnauthorized } from "@/lib/api";
import { apiKeys } from "@/hooks/queries/use-api-health";

/** Backend session (NEP-413 cookie). `null` = not signed in to the API. */
export function useMe(accountId: string | null | undefined) {
  return useQuery({
    queryKey: [...apiKeys.me, accountId ?? ""],
    queryFn: async () => {
      try {
        const me = await api.me();
        return me.accountId === accountId ? me : null;
      } catch (error) {
        if (isUnauthorized(error)) return null;
        throw error;
      }
    },
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });
}
