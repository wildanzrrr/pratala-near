import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getLotsForHolder } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";

export function useLotsForHolder(accountId: string | null | undefined) {
  return useQuery({
    queryKey: lotKeys.forHolder(accountId ?? ""),
    queryFn: () => (env.demoFixtures ? fixtures.forHolder(accountId!) : getLotsForHolder(accountId!)),
    enabled: Boolean(accountId),
  });
}
