import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export const profileKeys = {
  base: ["profile"] as const,
  detail: (accountId: string) => [...profileKeys.base, accountId] as const,
};

/** Public profile of any account (no phone); 404 when the user row is absent. */
export function usePublicProfile(accountId: string | undefined) {
  return useQuery({
    enabled: Boolean(accountId),
    queryKey: profileKeys.detail(accountId ?? ""),
    queryFn: () => api.profile(accountId!),
    staleTime: 60_000,
    retry: false,
  });
}
