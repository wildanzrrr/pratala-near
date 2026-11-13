import {
  Briefcase,
  ChartLineUp,
  Gear,
  Plant,
  Pulse,
  SealCheck,
  Storefront,
  Wallet,
  Notebook,
} from "@phosphor-icons/react";

import type { Icon } from "@phosphor-icons/react";
import type { MessageKey } from "@/lib/i18n/types";
import type { Intent } from "@/lib/near/types";

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: Icon;
}

const ITEMS = {
  market: { href: "/market", label: "nav.market", icon: Storefront },
  how: { href: "/#how-it-works", label: "nav.howItWorks", icon: Notebook },
  activity: { href: "/activity", label: "nav.activity", icon: Pulse },
  farmer: { href: "/farmer", label: "nav.farmer", icon: Plant },
  verify: { href: "/verify", label: "nav.verify", icon: SealCheck },
  portfolio: { href: "/portfolio", label: "nav.portfolio", icon: Briefcase },
  supplier: { href: "/supplier", label: "nav.supplier", icon: Wallet },
  exports: { href: "/exports", label: "nav.exports", icon: ChartLineUp },
  admin: { href: "/admin", label: "nav.admin", icon: Gear },
} satisfies Record<string, NavItem>;

/** Role-aware navigation. Chain roles beat the self-declared intent. */
export function navFor(opts: { connected: boolean; intent: Intent | null; verifier: boolean; admin: boolean }): NavItem[] {
  if (!opts.connected) return [ITEMS.market, ITEMS.how, ITEMS.activity];
  const items: NavItem[] = [ITEMS.market];
  if (opts.verifier || opts.intent === "verifier") items.push(ITEMS.verify);
  if (opts.intent === "farmer") items.push(ITEMS.farmer);
  if (opts.intent === "supplier") items.push(ITEMS.supplier);
  if (opts.intent === "buyer" || opts.intent === null || items.length === 1) items.push(ITEMS.portfolio);
  items.push(ITEMS.activity);
  if (opts.admin) items.push(ITEMS.admin);
  return items;
}

/** Secondary destinations that live in the account menu. */
export const ACCOUNT_LINKS: NavItem[] = [ITEMS.farmer, ITEMS.portfolio, ITEMS.verify, ITEMS.supplier, ITEMS.exports];
