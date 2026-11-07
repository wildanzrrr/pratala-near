import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getLotsByFarmer } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";

export function useLotsByFarmer(accountId: string | null | undefined) {
  return useQuery({
    queryKey: lotKeys.byFarmer(accountId ?? ""),
    queryFn: () => (env.demoFixtures ? fixtures.byFarmer(accountId!) : getLotsByFarmer(accountId!)),
    enabled: Boolean(accountId),
  });
}
