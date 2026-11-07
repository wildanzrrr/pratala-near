import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export const aiKeys = { detail: (id: string) => ["ai-check", id] as const };

export function useAiCheck(id: string | null | undefined) {
  return useQuery({
    queryKey: aiKeys.detail(id ?? ""),
    queryFn: () => api.getAiCheck(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
    retry: false,
  });
}
