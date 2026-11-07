"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

export type DeclareFailureVars = Parameters<typeof tx.declareFailure>[0];

export function useDeclareFailureMutation(onDone?: () => void) {
  return useTxMutation<DeclareFailureVars>({
    build: (vars) => tx.declareFailure(vars),
    success: "tx.failureDeclared",
    invalidate: (v) => [lotKeys.detail(v.lot_id), lotKeys.all],
    context: (v) => ({ lotId: v.lot_id }),
    onSuccess: () => onDone?.(),
  });
}
