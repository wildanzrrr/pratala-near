import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { intentsKeys } from "@/hooks/queries/use-intents-tokens";

import type { IntentsQuoteRequest } from "@/lib/near/types";

/**
 * Mainnet dry quote (no deposit address). Keyed by the submitted request; pass
 * `null` until the user asks for an estimate.
 */
export function useIntentsQuote(request: IntentsQuoteRequest | null) {
  return useQuery({
    queryKey: intentsKeys.quote({ ...(request ?? {}) }),
    queryFn: () => api.intentsQuote({ ...request!, dry: true }),
    enabled: request !== null,
    staleTime: 20_000,
    retry: false,
  });
}
