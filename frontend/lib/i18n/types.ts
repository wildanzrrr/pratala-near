import type { en } from "@/lib/i18n/en";

/** UI languages. English is the default; Bahasa Indonesia is the other. */
export type Locale = "en" | "id";
export const LOCALES: readonly Locale[] = ["en", "id"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "pratala_locale";

type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };

/** Shape of every dictionary, derived from the English source in lib/i18n/en.ts. */
export type Dictionary = Widen<typeof en>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dot path to any string, e.g. "landing.heroTitle". */
export type MessageKey = Leaves<Dictionary>;

export type Vars = Record<string, string | number>;

/** True when the value is a supported UI locale (guards cookie input). */
export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.includes(value as Locale);
}
