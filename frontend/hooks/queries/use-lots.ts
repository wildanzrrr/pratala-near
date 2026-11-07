import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getLots } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";

/** First page of lots (contract caps list views at 100). */
export function useLots(from = 0, limit = 100) {
  return useQuery({
    queryKey: lotKeys.list({ from, limit }),
    queryFn: () => (env.demoFixtures ? fixtures.lots() : getLots(from, limit)),
  });
}
