"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { aiKeys } from "@/hooks/queries/use-ai-check";

import type { AiCheck, AiCheckKind } from "@/lib/near/types";

/** NEAR AI Cloud evidence check. Advisory — flows continue when it is unavailable. */
export function useAiCheckMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    AiCheck,
    Error,
    { evidenceId: string; kind: AiCheckKind; expectedCrop?: string; plotLat?: number; plotLng?: number }
  >({
    mutationFn: (body) => api.aiCheck(body),
    onSuccess: (check) => queryClient.setQueryData(aiKeys.detail(check.id), check),
  });
}
