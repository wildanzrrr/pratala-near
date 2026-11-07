"use client";

import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Evidence, EvidenceKind } from "@/lib/near/types";

/** Multipart upload to POST /evidence (≤ 8 MB). Callers fall back to a local sha256 on failure. */
export function useUploadEvidenceMutation() {
  return useMutation<Evidence, Error, { file: File; kind: EvidenceKind; lotId?: string; plotId?: string }>({
    mutationFn: ({ file, kind, lotId, plotId }) => api.uploadEvidence(file, kind, { lotId, plotId }),
  });
}
