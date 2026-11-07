"use client";

import { tx } from "@/lib/near/contracts";
import { configKeys } from "@/hooks/queries/use-config";
import { roleKeys } from "@/hooks/queries/use-roles";
import { useTxMutation } from "@/hooks/mutations/use-tx-mutation";

import type { StoredRole } from "@/lib/near/types";

export type AdminAction =
  | { type: "addRole"; role: StoredRole; accountId: string }
  | { type: "removeRole"; role: StoredRole; accountId: string }
  | { type: "setFee"; feeBps: number }
  | { type: "setTreasury"; accountId: string }
  | { type: "setPaused"; paused: boolean };

/** Owner-only settings. Not in FC_METHODS, so each one asks the wallet. */
export function useAdminMutation() {
  return useTxMutation<AdminAction>({
    build: (a) => {
      switch (a.type) {
        case "addRole":
          return tx.addRole(a.role, a.accountId);
        case "removeRole":
          return tx.removeRole(a.role, a.accountId);
        case "setFee":
          return tx.setFeeBps(a.feeBps);
        case "setTreasury":
          return tx.setTreasury(a.accountId);
        case "setPaused":
          return tx.setPaused(a.paused);
      }
    },
    success: "tx.admin",
    invalidate: (a) =>
      a.type === "addRole" || a.type === "removeRole"
        ? [roleKeys.members(a.role), roleKeys.account(a.accountId)]
        : [configKeys.all],
  });
}
