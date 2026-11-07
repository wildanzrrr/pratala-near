"use client";

import { useEffect, useRef } from "react";

import { useAiCheckMutation } from "@/hooks/mutations/use-ai-check-mutation";

import type { EvidenceItem } from "@/components/evidence/evidence-uploader";
import type { AiCheckKind } from "@/lib/near/types";

/**
 * Runs the NEAR AI evidence check once per uploaded photo (the first one with
 * a server id). Advisory: failure just means "AI check unavailable".
 */
export function useAutoAiCheck(items: EvidenceItem[], kind: AiCheckKind, expectedCrop?: string) {
  const ai = useAiCheckMutation();
  const ran = useRef<string | null>(null);
  const evidenceId = items.find((i) => i.evidence?.id)?.evidence?.id ?? null;
  const { mutate } = ai;

  useEffect(() => {
    if (!evidenceId || ran.current === evidenceId) return;
    ran.current = evidenceId;
    mutate({ evidenceId, kind, expectedCrop });
  }, [evidenceId, kind, expectedCrop, mutate]);

  return ai;
}
