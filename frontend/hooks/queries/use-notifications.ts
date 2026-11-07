import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export const notificationKeys = { all: ["notifications"] as const, account: (id: string) => ["notifications", id] as const };

export function useNotifications(accountId: string | null | undefined, signedInToApi: boolean) {
  return useQuery({
    queryKey: notificationKeys.account(accountId ?? ""),
    queryFn: api.notifications,
    enabled: Boolean(accountId) && signedInToApi,
    refetchInterval: 30_000,
    retry: false,
  });
}
