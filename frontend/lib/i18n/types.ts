import type { id } from "@/lib/i18n/id";

export type Locale = "id" | "en";
export const LOCALES: readonly Locale[] = ["id", "en"];
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "pratala_locale";
export const LOCALE_STORAGE = "pratala:locale";

type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };

/** Shape of every dictionary, derived from the Bahasa Indonesia source. */
export type Dictionary = Widen<typeof id>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dot path to any string, e.g. "landing.heroTitle". */
export type MessageKey = Leaves<Dictionary>;

export type Vars = Record<string, string | number>;
