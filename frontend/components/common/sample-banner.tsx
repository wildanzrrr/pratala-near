"use client";

import { Flask } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { useT } from "@/providers/locale-provider";

/** Fixture mode is always announced; fixtures and chain data never share a view. */
export function SampleBanner() {
  const t = useT();
  if (!env.demoFixtures) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Badge variant="sample">
        <Flask data-icon="inline-start" />
        {t("common.sample")}
      </Badge>
      {t("common.sampleMode")}
    </p>
  );
}

export function SampleBadge() {
  const t = useT();
  if (!env.demoFixtures) return null;
  return <Badge variant="sample">{t("common.sample")}</Badge>;
}
