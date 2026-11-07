import { useQuery } from "@tanstack/react-query";

import { env } from "@/lib/env";
import { getRoles, listRole } from "@/lib/near/contracts";

import type { Role, StoredRole } from "@/lib/near/types";

export const roleKeys = {
  all: ["roles"] as const,
  account: (accountId: string) => ["roles", "account", accountId] as const,
  members: (role: StoredRole) => ["roles", "members", role] as const,
};

/** On-chain roles of an account. Fixture mode grants none (verifier flows need a real contract). */
export function useRoles(accountId: string | null | undefined) {
  return useQuery({
    queryKey: roleKeys.account(accountId ?? ""),
    queryFn: (): Promise<Role[]> => (env.demoFixtures ? Promise.resolve([]) : getRoles(accountId!)),
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });
}

export function useRoleMembers(role: StoredRole, enabled = true) {
  return useQuery({
    queryKey: roleKeys.members(role),
    queryFn: () => listRole(role),
    enabled: enabled && !env.demoFixtures,
  });
}
