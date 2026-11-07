"use client";

import { useT } from "@/providers/locale-provider";

import type { MessageKey, Vars } from "@/lib/i18n/types";

/** Translated text leaf, so server components can stay server components. */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  const t = useT();
  return <>{t(k, vars)}</>;
}
