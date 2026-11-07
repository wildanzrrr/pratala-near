import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getStats } from "@/lib/near/contracts";

export const statsKeys = { all: ["stats"] as const };

/** Live chain stats — the only numbers the landing page is allowed to show. */
export function useStats() {
  return useQuery({
    queryKey: statsKeys.all,
    queryFn: () => (env.demoFixtures ? fixtures.stats() : getStats()),
    staleTime: 30_000,
  });
}
