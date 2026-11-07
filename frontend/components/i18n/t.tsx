import { dictionary, lookup } from "@/lib/i18n";

import type { MessageKey, Vars } from "@/lib/i18n/types";

/** Text leaf from the dictionary. English is static, so this renders on the server too — no client boundary. */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  return <>{lookup(dictionary, k, vars)}</>;
}
