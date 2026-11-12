"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { base64ToBytes } from "@/lib/utils";
import { ssoDerivedPublicKey, verifySsoSession } from "@/lib/fastauth/client";
import { apiKeys } from "@/hooks/queries/use-api-health";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

/**
 * Backend login. Wallet accounts use NEP-413: POST /auth/challenge →
 * wallet.signMessage({message, recipient, nonce}) → POST /auth/verify →
 * httpOnly cookie. Email-SSO accounts cannot sign arbitrary messages — their
 * session is the Auth0-token binding (POST /auth/verify-sso), the same call
 * the boot restore makes. Only off-chain features (uploads, inbox, profile)
 * need it.
 */
export function useSignInBackendMutation() {
  const { signedAccountId, signMessage, authKind } = useNear();
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: async () => {
      if (authKind === "sso") {
        const publicKey = await ssoDerivedPublicKey();
        return verifySsoSession(signedAccountId, publicKey);
      }
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
