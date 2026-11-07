import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getConfig } from "@/lib/near/contracts";

export const configKeys = { all: ["config"] as const };

export function useConfig() {
  return useQuery({
    queryKey: configKeys.all,
    queryFn: () => (env.demoFixtures ? fixtures.config() : getConfig()),
    staleTime: 5 * 60_000,
  });
}
