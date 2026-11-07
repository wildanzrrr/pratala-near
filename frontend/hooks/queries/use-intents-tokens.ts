import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { IntentsToken } from "@/lib/near/types";

export const intentsKeys = {
  tokens: ["intents", "tokens"] as const,
  quote: (params: Record<string, unknown>) => ["intents", "quote", params] as const,
};

/** 1Click token list via the backend proxy (cached 60 s server-side). */
export function useIntentsTokens() {
  return useQuery({
    queryKey: intentsKeys.tokens,
    queryFn: async (): Promise<IntentsToken[]> => {
      const body = await api.intentsTokens();
      const tokens = Array.isArray(body) ? body : body.tokens;
      return tokens.filter((t) => t.assetId && t.blockchain && t.symbol && Number.isInteger(t.decimals));
    },
    staleTime: 60_000,
    retry: false,
  });
}
