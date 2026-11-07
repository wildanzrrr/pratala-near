"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { saveLocalProfile } from "@/lib/profile";
import { apiKeys } from "@/hooks/queries/use-api-health";

import type { Profile } from "@/lib/near/types";

/** Saves the profile locally first, then to the API when signed in. */
export function useProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation<{ remote: boolean }, Error, { accountId: string; profile: Profile; signedInToApi: boolean }>({
    mutationFn: async ({ accountId, profile, signedInToApi }) => {
      saveLocalProfile(accountId, profile);
      if (!signedInToApi) return { remote: false };
      try {
        await api.saveProfile(profile);
        return { remote: true };
      } catch {
        return { remote: false };
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeys.me }),
  });
}
