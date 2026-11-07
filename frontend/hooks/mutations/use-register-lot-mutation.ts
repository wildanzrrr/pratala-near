"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { statsKeys } from "@/hooks/queries/use-stats";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

import type { RegisterLotArgs } from "@/lib/near/contracts";

/** register_lot — 0.1 NEAR deposit, so it always goes through the wallet. Returns the new lot_id. */
export function useRegisterLotMutation(onRegistered?: (lotId: string | null) => void) {
  return useTxMutation<RegisterLotArgs, string>({
    build: (args) => tx.registerLot(args),
    success: "tx.registered",
    invalidate: (_v, account) => [lotKeys.byFarmer(account), lotKeys.all, statsKeys.all],
    onSuccess: (result) => onRegistered?.(result.result),
  });
}
