"use client";

import { useEffect, useState } from "react";

import { accountExistsOnChain, ssoAccountIdForLabel, SSO_LABEL_PATTERN } from "@/lib/fastauth/client";

export type Availability = "idle" | "invalid" | "checking" | "taken" | "free";

/**
 * Live availability of a chosen account label: the shape check is derived
 * synchronously; a debounced on-chain lookup of the full `<label>.<sponsor>`
 * id fills in taken/free (the chain is the duplicate-check source of truth,
 * and the backend re-checks on creation).
 */
export function useLabelAvailability(label: string): Availability {
  const [checked, setChecked] = useState<{ label: string; exists: boolean } | null>(null);

  useEffect(() => {
    const trimmed = label.trim();
    if (!trimmed || !SSO_LABEL_PATTERN.test(trimmed)) return;
    const timer = setTimeout(() => {
      accountExistsOnChain(ssoAccountIdForLabel(trimmed))
        .then((exists) => setChecked({ label: trimmed, exists }))
        .catch(() => setChecked({ label: trimmed, exists: false })); // RPC down — creation re-checks
    }, 450);
    return () => clearTimeout(timer);
  }, [label]);

  const trimmed = label.trim();
  if (!trimmed) return "idle";
  if (!SSO_LABEL_PATTERN.test(trimmed)) return "invalid";
  if (checked?.label === trimmed) return checked.exists ? "taken" : "free";
  return "checking";
}
