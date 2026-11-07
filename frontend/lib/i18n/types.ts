import type { en } from "@/lib/i18n/en";

/** The UI ships in English only. `Locale` stays a type so formatters keep one seam. */
export type Locale = "en";
export const LOCALES: readonly Locale[] = ["en"];
export const DEFAULT_LOCALE: Locale = "en";

type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };

/** Shape of the dictionary, derived from the English source in lib/i18n/en.ts. */
export type Dictionary = Widen<typeof en>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dot path to any string, e.g. "landing.heroTitle". */
export type MessageKey = Leaves<Dictionary>;

export type Vars = Record<string, string | number>;
