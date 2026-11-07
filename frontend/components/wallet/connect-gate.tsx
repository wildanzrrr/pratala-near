"use client";

import { SignIn } from "@phosphor-icons/react";

import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { openConnectSheet } from "@/components/wallet/connect-store";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

import type { ReactNode } from "react";

/** Renders children only for a signed-in account; otherwise one clear "Masuk" step. */
export function ConnectGate({ children }: { children: ReactNode }) {
  const { signedAccountId, loading } = useNear();
  const t = useT();
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!signedAccountId) {
    return (
      <EmptyState
        icon={SignIn}
        title={t("wallet.needConnect")}
        body={t("wallet.needConnectLead")}
        action={
          <Button size="lg" onClick={openConnectSheet}>
            <SignIn data-icon="inline-start" />
            {t("wallet.connectLong")}
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
