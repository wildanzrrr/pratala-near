import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { env } from "@/lib/env";

/** Off-chain enrichment of a lot: evidence files and AI checks. */
export const lotApiKeys = {
  all: ["lot-api"] as const,
  detail: (lotId: string) => ["lot-api", "detail", lotId] as const,
  history: (lotId: string) => ["lot-api", "history", lotId] as const,
};

export function useEvidence(lotId: string) {
  return useQuery({
    queryKey: lotApiKeys.detail(lotId),
    queryFn: () => api.lot(lotId),
    enabled: Boolean(lotId) && !env.demoFixtures,
    select: (lot) => ({ evidence: lot.evidence ?? [], aiChecks: lot.aiChecks ?? [] }),
    retry: false,
  });
}
