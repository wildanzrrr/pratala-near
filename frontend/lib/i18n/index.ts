import { en } from "@/lib/i18n/en";

import type { Dictionary, MessageKey, Vars } from "@/lib/i18n/types";

/** The one product dictionary (English). */
export const dictionary: Dictionary = en;

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
export function serverT() {
  return (key: MessageKey, vars?: Vars) => lookup(dictionary, key, vars);
}
