"use client";

import { createContext, useCallback, useEffect, useMemo, use, useSyncExternalStore } from "react";

import { dictionaries, lookup } from "@/lib/i18n";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n/types";

import type { ReactNode } from "react";
import type { Dictionary, Locale, MessageKey, Vars } from "@/lib/i18n/types";

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  t: (key: MessageKey, vars?: Vars) => string;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** The cookie is the locale store; setLocale writes it and pings subscribers. */
const localeListeners = new Set<() => void>();

function readSnapshot(): Locale {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.slice(LOCALE_COOKIE.length + 1);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

function subscribeLocale(callback: () => void) {
  localeListeners.add(callback);
  return () => localeListeners.delete(callback);
}

/**
 * UI language (English default, Bahasa Indonesia second). The locale lives in
 * a cookie read through useSyncExternalStore: the server and the hydration
 * pass render English (stable static prerender), the stored choice applies
 * immediately after, and setLocale swaps the dictionary live and persists it
 * for the next visit.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, readSnapshot, () => DEFAULT_LOCALE);

  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    localeListeners.forEach((listener) => listener());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dict: dictionaries[locale],
      t: (key, vars) => lookup(dictionaries[locale], key, vars),
      setLocale,
    }),
    [locale, setLocale],
  );

  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale(): LocaleContextValue {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}

export const useT = () => useLocale().t;
