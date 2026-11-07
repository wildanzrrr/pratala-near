"use client";

import Link from "next/link";

import { CloudSlash, Plugs, Warning } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { isApiUnavailable } from "@/lib/api";
import { env } from "@/lib/env";
import { ChainUnavailableError, isNotDeployed } from "@/lib/near/errors";
import { useT } from "@/providers/locale-provider";

import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** Generic empty state: one line what's empty, one line why it matters, one action. */
export function EmptyState({
  icon: IconCmp,
  title,
  body,
  action,
}: {
  icon?: Icon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Empty className="border border-dashed border-border bg-card/60 py-10">
      <EmptyHeader>
        {IconCmp ? (
          <EmptyMedia variant="icon">
            <IconCmp />
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="font-heading text-lg">{title}</EmptyTitle>
        {body ? <EmptyDescription>{body}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function NotDeployedState({ contractId = env.lotsContractId }: { contractId?: string }) {
  const t = useT();
  return (
    <EmptyState
      icon={Plugs}
      title={t("states.notDeployedTitle")}
      body={t("states.notDeployedBody", { contract: contractId })}
    />
  );
}

export function ChainDownState({ onRetry }: { onRetry?: () => void }) {
  const t = useT();
  return (
    <EmptyState
      icon={CloudSlash}
      title={t("states.chainDownTitle")}
      body={t("states.chainDownBody")}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        ) : null
      }
    />
  );
}

/** Maps any query error to the right state component. */
export function QueryErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  if (isNotDeployed(error)) return <NotDeployedState contractId={error.contractId} />;
  if (error instanceof ChainUnavailableError) return <ChainDownState onRetry={onRetry} />;
  if (isApiUnavailable(error)) return null;
  return (
    <EmptyState
      icon={Warning}
      title={t("states.errorTitle")}
      body={error instanceof Error && error.message ? error.message : t("states.errorBody")}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/">{t("states.home")}</Link>
          </Button>
        )
      }
    />
  );
}
