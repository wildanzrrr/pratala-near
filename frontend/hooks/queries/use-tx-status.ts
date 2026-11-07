import { useQuery } from "@tanstack/react-query";

import { eventsOf, rpc } from "@/lib/near/contracts";

export const txKeys = { status: (hash: string, signer: string) => ["tx", hash, signer] as const };

/** Final outcome + NEP-297 events of a transaction (needs the sender account id). */
export function useTxStatus(txHash: string, signerId: string | null) {
  return useQuery({
    queryKey: txKeys.status(txHash, signerId ?? ""),
    queryFn: async () => {
      const outcome = await rpc().viewTransactionStatusWithReceipts({ txHash, accountId: signerId!, waitUntil: "FINAL" });
      const o = outcome as unknown as {
        status?: Record<string, unknown>;
        transaction?: { signer_id?: string; receiver_id?: string; hash?: string };
      };
      const ok = o.status ? "SuccessValue" in o.status : false;
      const failed = o.status ? "Failure" in o.status : false;
      return {
        state: ok ? ("success" as const) : failed ? ("failure" as const) : ("pending" as const),
        signerId: o.transaction?.signer_id ?? signerId!,
        receiverId: o.transaction?.receiver_id ?? null,
        events: eventsOf(outcome),
      };
    },
    enabled: Boolean(txHash && signerId),
    retry: 3,
    retryDelay: 2000,
    staleTime: Infinity,
  });
}
