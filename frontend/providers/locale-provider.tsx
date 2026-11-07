"use client";

import { createContext, use } from "react";

import { dictionary, lookup } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

import type { ReactNode } from "react";
import type { Dictionary, Locale, MessageKey, Vars } from "@/lib/i18n/types";

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  t: (key: MessageKey, vars?: Vars) => string;
}

/** English-only: the value is static, so it is built once at module scope (no re-renders, no hydration switch). */
const value: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  dict: dictionary,
  t: (key, vars) => lookup(dictionary, key, vars),
};

const LocaleContext = createContext<LocaleContextValue>(value);

/** Thin provider kept so call sites use one `useLocale()` / `useT()` API for copy and formatting. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale(): LocaleContextValue {
  return use(LocaleContext);
}

export const useT = () => useLocale().t;
