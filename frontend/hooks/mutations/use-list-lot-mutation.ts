"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

const lotScoped = (lotId: string, account: string) => [lotKeys.detail(lotId), lotKeys.byFarmer(account), lotKeys.all];

/** Farmer price actions — all zero-deposit, signed by the function-call key. */
export function useListLotMutation() {
  return useTxMutation<{ lotId: string; pricePerKg: string }>({
    build: (v) => tx.listLot(v.lotId, v.pricePerKg),
    success: "tx.listed",
    invalidate: (v, a) => lotScoped(v.lotId, a),
    context: (v) => ({ lotId: v.lotId }),
  });
}

export function useUpdatePriceMutation() {
  return useTxMutation<{ lotId: string; pricePerKg: string }>({
    build: (v) => tx.updatePrice(v.lotId, v.pricePerKg),
    success: "tx.priceUpdated",
    invalidate: (v, a) => lotScoped(v.lotId, a),
    context: (v) => ({ lotId: v.lotId }),
  });
}

export function useDelistLotMutation() {
  return useTxMutation<{ lotId: string }>({
    build: (v) => tx.delistLot(v.lotId),
    success: "tx.delisted",
    invalidate: (v, a) => lotScoped(v.lotId, a),
    context: (v) => ({ lotId: v.lotId }),
  });
}

export function useCancelLotMutation() {
  return useTxMutation<{ lotId: string }>({
    build: (v) => tx.cancelLot(v.lotId),
    success: "tx.cancelled",
    invalidate: (v, a) => lotScoped(v.lotId, a),
    context: (v) => ({ lotId: v.lotId }),
  });
}
