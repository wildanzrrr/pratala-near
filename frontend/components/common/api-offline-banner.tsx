"use client";

import { CloudSlash } from "@phosphor-icons/react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { env } from "@/lib/env";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useT } from "@/providers/locale-provider";

/** Shown wherever off-chain data would appear; chain data keeps rendering underneath. */
export function ApiOfflineBanner({ force = false }: { force?: boolean }) {
  const t = useT();
  const health = useApiHealth();
  if (env.demoFixtures) return null;
  const offline = force || health.isError;
  if (!offline) return null;
  return (
    <Alert role="status" className="border-warning-foreground/20 bg-warning text-warning-foreground">
      <CloudSlash />
      <AlertDescription className="text-warning-foreground">{t("states.apiOffline")}</AlertDescription>
    </Alert>
  );
}
