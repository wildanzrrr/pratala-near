import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { fixtures } from "@/lib/fixtures";
import { getLot } from "@/lib/near/contracts";

import type { Status } from "@/lib/near/types";

/** Hierarchical keys for every chain lot/share read; mutations invalidate `lotKeys.all`. */
export const lotKeys = {
  all: ["lots"] as const,
  detail: (lotId: string) => ["lots", "detail", lotId] as const,
  list: (page: { from: number; limit: number }) => ["lots", "list", page] as const,
  byStatus: (status: Status) => ["lots", "status", status] as const,
  byFarmer: (accountId: string) => ["lots", "farmer", accountId] as const,
  forHolder: (accountId: string) => ["lots", "holder", accountId] as const,
  sharesForOwner: (accountId: string) => ["lots", "shares", accountId] as const,
};

export function useLot(lotId: string) {
  return useQuery({
    queryKey: lotKeys.detail(lotId),
    queryFn: () => (env.demoFixtures ? fixtures.lot(lotId) : getLot(lotId)),
    enabled: Boolean(lotId),
  });
}
