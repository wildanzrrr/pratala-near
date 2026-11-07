"use client";

import { useState } from "react";

import { SealCheck } from "@phosphor-icons/react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import { CopyButton } from "@/components/common/copy-button";
import { EmptyState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { TaskQueue } from "@/app/verify/_components/task-queue";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

import type { VerifierRole } from "@/lib/roles";

export function VerifyView() {
  const { t } = useLocale();
  return (
    <PageBody>
      <PageHeader title={t("verify.title")} lead={t("verify.lead")} />
      <ConnectGate>
        <VerifyBody />
      </ConnectGate>
    </PageBody>
  );
}

function VerifyBody() {
  const { t } = useLocale();
  const session = useSession();
  const roles = session.verifierRoles;
  const [picked, setPicked] = useState<VerifierRole | null>(null);
  const role = picked && roles.includes(picked) ? picked : roles[0];

  if (session.loading) return <Skeleton className="h-64 w-full" />;
  if (!role) {
    return (
      <EmptyState
        icon={SealCheck}
        title={t("verify.noRoleTitle")}
        body={
          <span className="inline-flex flex-wrap items-center justify-center gap-1">
            {t("verify.noRoleBody", { account: session.accountId ?? "" })}
            <CopyButton value={session.accountId ?? ""} />
          </span>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ApiOfflineBanner />
      {roles.length > 1 ? (
        <ToggleGroup type="single" variant="outline" value={role} onValueChange={(v) => v && setPicked(v as VerifierRole)} className="flex-wrap justify-start">
          {roles.map((r) => (
            <ToggleGroupItem key={r} value={r}>
              {t(`roles.${r}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <p className="text-sm text-muted-foreground">{t(`roles.${role}`)}</p>
      )}
      <TaskQueue role={role} />
    </div>
  );
}
