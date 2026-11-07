"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

export type AttestFieldVars = Parameters<typeof tx.attestField>[0];

export function useAttestFieldMutation(onDone?: () => void) {
  return useTxMutation<AttestFieldVars>({
    build: (vars) => tx.attestField(vars),
    success: "tx.attested",
    invalidate: (v) => [lotKeys.detail(v.lot_id), lotKeys.byStatus("Registered"), lotKeys.byStatus("FieldVerified")],
    context: (v) => ({ lotId: v.lot_id }),
    onSuccess: () => onDone?.(),
  });
}
