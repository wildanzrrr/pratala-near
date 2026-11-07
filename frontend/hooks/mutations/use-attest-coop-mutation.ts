"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { statsKeys } from "@/hooks/queries/use-stats";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

export type AttestCoopVars = Parameters<typeof tx.attestCoop>[0];

export function useAttestCoopMutation(onDone?: () => void) {
  return useTxMutation<AttestCoopVars>({
    build: (vars) => tx.attestCoop(vars),
    success: "tx.attested",
    invalidate: (v) => [lotKeys.detail(v.lot_id), lotKeys.byStatus("FieldVerified"), lotKeys.byStatus("CoopVerified"), statsKeys.all],
    context: (v) => ({ lotId: v.lot_id }),
    onSuccess: () => onDone?.(),
  });
}
