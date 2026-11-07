import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getLotsByStatus } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";

import type { Status } from "@/lib/near/types";

export function useLotsByStatus(status: Status, enabled = true) {
  return useQuery({
    queryKey: lotKeys.byStatus(status),
    queryFn: () => (env.demoFixtures ? fixtures.byStatus(status) : getLotsByStatus(status)),
    enabled,
  });
}
