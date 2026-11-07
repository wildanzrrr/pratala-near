"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { explorer } from "@/lib/explorer";
import { lastResultOf, txHashOf } from "@/lib/near/contracts";
import { WalletRejectedError, classifyTxError, contractPanicMessage } from "@/lib/near/errors";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

import type { QueryKey } from "@tanstack/react-query";
import type { TxRequest } from "@/lib/near/contracts";
import type { MessageKey } from "@/lib/i18n/types";

export interface TxResult<R = unknown> {
  hash: string | null;
  outcome: unknown;
  result: R | null;
}

export interface TxMutationConfig<V, R> {
  build: (vars: V, accountId: string) => TxRequest | Promise<TxRequest>;
  /** plain-language toast on success */
  success: MessageKey | ((result: TxResult<R>, vars: V) => MessageKey);
  /** exact keys this transaction changes */
  invalidate: (vars: V, accountId: string) => QueryKey[];
  /** context for the indexer hint */
  context?: (vars: V) => { lotId?: string; orderId?: string };
  onSuccess?: (result: TxResult<R>, vars: V) => void | Promise<void>;
}

function failureOf(outcome: unknown): string | null {
  const status = (outcome as { status?: { Failure?: unknown } } | null)?.status;
  if (!status || !("Failure" in (status as object))) return null;
  const text = JSON.stringify(status.Failure);
  return contractPanicMessage(text) ?? text.slice(0, 160);
}

/**
 * Shared lifecycle for every on-chain action:
 * sign (FC key locally when allowed, else wallet) → POST /api/tx (ignored on failure)
 * → invalidate exact keys → toast with a "Lihat bukti" explorer link.
 */
export function useTxMutation<V = void, R = unknown>(config: TxMutationConfig<V, R>) {
  const { signedAccountId, signAndSendTransaction, hasFunctionCallKey } = useNear();
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation<TxResult<R>, Error, V>({
    mutationFn: async (vars) => {
      if (!signedAccountId) throw new Error(t("wallet.needConnect"));
      const tx = await config.build(vars, signedAccountId);
      const silent = tx.silent && hasFunctionCallKey;
      const toastId = toast.loading(silent ? t("tx.silent") : t("tx.pending"));
      try {
        const outcome = await signAndSendTransaction(tx);
        const failure = failureOf(outcome);
        if (failure) throw new Error(failure);
        const hash = txHashOf(outcome);
        toast.dismiss(toastId);
        return { hash, outcome, result: lastResultOf<R>(outcome) };
      } catch (error) {
        toast.dismiss(toastId);
        throw classifyTxError(error);
      }
    },
    onSuccess: async (result, vars) => {
      if (result.hash) {
        api.postTx({ txHash: result.hash, signerId: signedAccountId, context: config.context?.(vars) }).catch(() => undefined);
      }
      await Promise.all(
        config.invalidate(vars, signedAccountId).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      const key = typeof config.success === "function" ? config.success(result, vars) : config.success;
      toast.success(t(key), {
        action: result.hash
          ? { label: t("common.viewProof"), onClick: () => window.open(explorer.tx(result.hash!), "_blank", "noopener") }
          : undefined,
      });
      await config.onSuccess?.(result, vars);
    },
    onError: (error) => {
      if (error instanceof WalletRejectedError) {
        toast.message(t("tx.rejected"));
        return;
      }
      const reason = contractPanicMessage(error) ?? error.message;
      toast.error(reason ? t("tx.failed", { reason }) : t("tx.failedGeneric"));
    },
  });
}
