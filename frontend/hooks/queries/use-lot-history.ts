import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { lotApiKeys } from "@/hooks/queries/use-lot-api";

/** Indexed events (with tx hashes) for the ownership + money timelines. */
export function useLotHistory(lotId: string) {
  return useQuery({
    queryKey: lotApiKeys.history(lotId),
    queryFn: () => api.lotHistory(lotId),
    enabled: Boolean(lotId) && !env.demoFixtures,
    retry: false,
  });
}
