"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { statsKeys } from "@/hooks/queries/use-stats";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

export type WeighInVars = Parameters<typeof tx.weighIn>[0];

export function useWeighInMutation(onDone?: () => void) {
  return useTxMutation<WeighInVars>({
    build: (vars) => tx.weighIn(vars),
    success: "tx.weighed",
    invalidate: (v) => [lotKeys.detail(v.lot_id), lotKeys.all, statsKeys.all],
    context: (v) => ({ lotId: v.lot_id }),
    onSuccess: () => onDone?.(),
  });
}
