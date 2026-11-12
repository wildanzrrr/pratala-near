import { en } from "@/lib/i18n/en";
import { id } from "@/lib/i18n/id";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

import type { Dictionary, Locale, MessageKey, Vars } from "@/lib/i18n/types";

export const dictionaries: Record<Locale, Dictionary> = { en, id };

/** "{n} lots" + { n: 3 } → "3 lots". Unknown placeholders stay visible so gaps are obvious. */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function lookup(dict: Dictionary, key: MessageKey, vars?: Vars): string {
  let node: unknown = dict;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === "string" ? format(node, vars) : key;
}

/** Server-side translator for metadata, OG images and static shells. */
export function serverT(locale: Locale = DEFAULT_LOCALE) {
  const dict = dictionaries[locale] ?? dictionaries.en;
  return (key: MessageKey, vars?: Vars) => lookup(dict, key, vars);
}
