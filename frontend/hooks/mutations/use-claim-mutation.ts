"use client";

import { tx } from "@/lib/near/contracts";
import { lotKeys } from "@/hooks/queries/use-lot";
import { pusdcKeys } from "@/hooks/queries/use-pusdc-balance";
import { statsKeys } from "@/hooks/queries/use-stats";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

import type { ClaimKind } from "@/lib/near/types";

/** claim_payout / claim_fee take a lot id; claim_refund takes the share NFT id. */
export type ClaimVars = { lotId: string; shareId?: string };

const build = {
  Farmer: (v: ClaimVars) => tx.claimPayout(v.lotId),
  Holder: (v: ClaimVars) => tx.claimRefund(v.shareId ?? ""),
  Treasury: (v: ClaimVars) => tx.claimFee(v.lotId),
} as const;

/**
 * claim_payout / claim_refund / claim_fee — zero deposit, FC-key signed.
 * The contract returns `false` when the pUSDC transfer failed and the claim was restored.
 */
export function useClaimMutation(kind: ClaimKind) {
  return useTxMutation<ClaimVars, boolean>({
    build: (v) => build[kind](v),
    success: (result) => (result.result === false ? "tx.claimRestored" : "tx.claimed"),
    invalidate: (v, a) => [
      lotKeys.detail(v.lotId),
      lotKeys.byFarmer(a),
      lotKeys.forHolder(a),
      lotKeys.sharesForOwner(a),
      pusdcKeys.balance(a),
      statsKeys.all,
    ],
    context: (v) => ({ lotId: v.lotId }),
  });
}
