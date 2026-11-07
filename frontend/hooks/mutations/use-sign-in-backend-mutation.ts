"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { base64ToBytes } from "@/lib/utils";
import { apiKeys } from "@/hooks/queries/use-api-health";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

/**
 * NEP-413 backend login: POST /auth/challenge → wallet.signMessage({message,
 * recipient, nonce}) → POST /auth/verify → httpOnly cookie. Only off-chain
 * features (uploads, inbox, profile) need it.
 */
export function useSignInBackendMutation() {
  const { signedAccountId, signMessage } = useNear();
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: async () => {
      const challenge = await api.challenge(signedAccountId);
      const signed = await signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: base64ToBytes(challenge.nonce),
      });
      return api.verify({
        accountId: signed.accountId || signedAccountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
        nonce: challenge.nonce,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiKeys.me });
      toast.success(t("wallet.backendSignedIn"));
    },
    onError: (error) => toast.error(error.message || t("wallet.noSignMessage")),
  });
}

export function useSignOutBackendMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: apiKeys.me }),
  });
}
