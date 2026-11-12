"use client";

import { useLocale } from "@/providers/locale-provider";

import type { MessageKey, Vars } from "@/lib/i18n/types";

/** Text leaf from the active dictionary — a client leaf so it follows the language switcher. */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  const { t } = useLocale();
  return <>{t(k, vars)}</>;
}
