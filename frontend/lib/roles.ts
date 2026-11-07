import type { Config, Intent, Role } from "@/lib/near/types";

export const VERIFIER_ROLES = ["FieldAgent", "Coop", "Warehouse"] as const;
export type VerifierRole = (typeof VERIFIER_ROLES)[number];

export function verifierRoles(roles: readonly Role[] | undefined): VerifierRole[] {
  return (roles ?? []).filter((r): r is VerifierRole => (VERIFIER_ROLES as readonly string[]).includes(r));
}

export function isAdmin(accountId: string | null | undefined, config: Config | undefined): boolean {
  return Boolean(accountId && config && config.owner_id === accountId);
}

/** Effective roles = on-chain roles + "Admin" when the account owns the contract. */
export function effectiveRoles(accountId: string | null, roles: Role[] | undefined, config: Config | undefined): Role[] {
  const set = new Set<Role>(roles ?? []);
  if (isAdmin(accountId, config)) set.add("Admin");
  return [...set];
}

/** Home route for a user after onboarding. Chain roles beat the self-declared intent. */
export function homeFor(intent: Intent | null, roles: Role[]): string {
  if (verifierRoles(roles).length > 0) return "/verify";
  switch (intent) {
    case "farmer":
      return "/farmer";
    case "buyer":
      return "/portfolio";
    case "supplier":
      return "/supplier";
    case "verifier":
      return "/verify";
    default:
      return "/market";
  }
}
