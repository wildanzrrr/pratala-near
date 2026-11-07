"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";

import type { ReactNode } from "react";
import type { Role } from "@/lib/near/types";

/** Shows children when the account holds any of `roles` (on-chain; Admin = contract owner). */
export function RoleGate({ roles, children, fallback }: { roles: Role[]; children: ReactNode; fallback: ReactNode }) {
  const session = useSession();
  if (session.loading) return <Skeleton className="h-40 w-full" />;
  const allowed = session.roles.some((r) => roles.includes(r));
  return <>{allowed ? children : fallback}</>;
}
