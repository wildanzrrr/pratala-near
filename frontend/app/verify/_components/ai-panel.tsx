"use client";

import { Sparkle } from "@phosphor-icons/react";

import { Spinner } from "@/components/ui/spinner";
import { AiCheckBadge } from "@/components/trust/ai-check-badge";
import { API_UNAVAILABLE_MESSAGE } from "@/lib/api";
import { useT } from "@/providers/locale-provider";

import type { UseMutationResult } from "@tanstack/react-query";
import type { AiCheck } from "@/lib/near/types";

/** AI result inside a task: running → verdict badge, or a quiet "unavailable" that never blocks. */
export function AiPanel({ ai }: { ai: Pick<UseMutationResult<AiCheck, Error, never>, "status" | "data" | "error"> }) {
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
    // Surface the server's reason (e.g. the NEAR AI upstream error) instead of
    // hiding it behind a generic "unavailable" — it is advisory, never blocking.
    const message = ai.error instanceof Error ? ai.error.message : null;
    const detail = message && message !== API_UNAVAILABLE_MESSAGE ? message : null;
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkle aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0">
          {t("ai.unavailable")}
          {detail ? (
            <span className="block truncate" title={detail}>
              {detail}
            </span>
          ) : null}
        </span>
      </p>
    );
  }
  return <AiCheckBadge check={ai.data} />;
}
