"use client";

import { useSyncExternalStore } from "react";

import { loadIntent, loadLocalProfile } from "@/lib/profile";
import { effectiveRoles, isAdmin, verifierRoles } from "@/lib/roles";
import { useConfig } from "@/hooks/queries/use-config";
import { useMe } from "@/hooks/queries/use-me";
import { useRoles } from "@/hooks/queries/use-roles";
import { useNear } from "@/providers/near-provider";

import type { Intent, Profile } from "@/lib/near/types";

function subscribeProfile(cb: () => void) {
  window.addEventListener("pratala:profile", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("pratala:profile", cb);
    window.removeEventListener("storage", cb);
  };
}

let cachedKey = "";
let cached: Profile | null = null;
function readProfile(accountId: string): Profile | null {
  const raw = accountId ? JSON.stringify(loadLocalProfile(accountId)) : "null";
  if (raw !== cachedKey) {
    cachedKey = raw;
    cached = JSON.parse(raw) as Profile | null;
  }
  return cached;
}

/**
 * Everything the shell needs to be role-aware: wallet account, on-chain roles,
 * admin (contract owner), backend session and the self-declared intent.
 */
export function useSession() {
  const near = useNear();
  const accountId = near.signedAccountId || null;
  const roles = useRoles(accountId);
  const config = useConfig();
  const me = useMe(accountId);
  const localProfile = useSyncExternalStore(
    subscribeProfile,
    () => readProfile(near.signedAccountId),
    () => null,
  );
  const intent = useSyncExternalStore(
    subscribeProfile,
    () => loadIntent(),
    () => null as Intent | null,
  );
  const all = effectiveRoles(accountId, roles.data, config.data);
  return {
    ...near,
    accountId,
    roles: all,
    verifierRoles: verifierRoles(all),
    isAdmin: isAdmin(accountId, config.data),
    config: config.data,
    signedInToApi: Boolean(me.data),
    me: me.data ?? null,
    profile: me.data?.profile ?? localProfile,
    intent: me.data?.profile?.intent ?? localProfile?.intent ?? intent,
  };
}
