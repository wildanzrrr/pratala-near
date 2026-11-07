"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { notificationKeys } from "@/hooks/queries/use-notifications";

import type { AppNotification } from "@/lib/near/types";

/** Optimistic: the row reads as read immediately, rolls back on failure. */
export function useMarkReadMutation(accountId: string) {
  const queryClient = useQueryClient();
  const key = notificationKeys.account(accountId);
  return useMutation<void, Error, string, { previous?: AppNotification[] }>({
    mutationFn: (id) => api.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AppNotification[]>(key);
      queryClient.setQueryData<AppNotification[]>(key, (rows) => rows?.map((n) => (n.id === id ? { ...n, read: true } : n)));
      return { previous };
    },
    onError: (_e, _id, ctx) => ctx?.previous && queryClient.setQueryData(key, ctx.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
