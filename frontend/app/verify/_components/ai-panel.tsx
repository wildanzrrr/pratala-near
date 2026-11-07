"use client";

import { Sparkle } from "@phosphor-icons/react";

import { Spinner } from "@/components/ui/spinner";
import { AiCheckBadge } from "@/components/trust/ai-check-badge";
import { useT } from "@/providers/locale-provider";

import type { UseMutationResult } from "@tanstack/react-query";
import type { AiCheck } from "@/lib/near/types";

/** AI result inside a task: running → verdict badge, or a quiet "unavailable" that never blocks. */
export function AiPanel({ ai }: { ai: Pick<UseMutationResult<AiCheck, Error, never>, "status" | "data"> }) {
  const t = useT();
  if (ai.status === "idle") return null;
  if (ai.status === "pending") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Spinner />
        {t("ai.running")}
      </p>
    );
  }
  if (ai.status === "error" || !ai.data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkle aria-hidden className="size-4" />
        {t("ai.unavailable")}
      </p>
    );
  }
  return <AiCheckBadge check={ai.data} />;
}
