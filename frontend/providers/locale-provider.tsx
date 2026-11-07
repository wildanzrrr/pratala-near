"use client";

import { createContext, use, useCallback, useMemo, useSyncExternalStore } from "react";

import { dictionaries, lookup } from "@/lib/i18n";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_STORAGE } from "@/lib/i18n/types";

import type { ReactNode } from "react";
import type { Dictionary, Locale, MessageKey, Vars } from "@/lib/i18n/types";

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const listeners = new Set<() => void>();

function readStored(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE);
    return value === "en" || value === "id" ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === LOCALE_STORAGE && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Bahasa Indonesia by default. The choice persists in localStorage + a cookie
 * (the cookie lets a future server render pick it up). The server snapshot is
 * always the default so hydration matches; English users switch after mount.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readStored, () => DEFAULT_LOCALE);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(LOCALE_STORAGE, next);
    } catch {
      /* private mode: keep in-memory only */
    }
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const dict = dictionaries[locale];
    return { locale, dict, setLocale, t: (key, vars) => lookup(dict, key, vars) };
  }, [locale, setLocale]);

  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale(): LocaleContextValue {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside <LocaleProvider>");
  return ctx;
}

export const useT = () => useLocale().t;
