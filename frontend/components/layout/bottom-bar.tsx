"use client";

import { Suspense } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive } from "@/components/layout/site-header";
import { navFor } from "@/components/layout/nav-items";
import type { NavItem } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/providers/locale-provider";

/** Phone navigation: thumb-reach bar, max five destinations, labels always visible. */
export function BottomBar() {
  const t = useT();
  const session = useSession();
  const items = navFor({
    connected: Boolean(session.accountId),
    intent: session.intent,
    verifier: session.verifierRoles.length > 0,
    admin: session.isAdmin,
  }).slice(0, 5);

  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-(--pt-z-sticky) border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden print:hidden"
    >
      <ul className="grid h-(--pt-bottom-bar-h)" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        <Suspense fallback={<BarItems items={items} pathname="" />}>
          <ActiveBarItems items={items} />
        </Suspense>
      </ul>
    </nav>
  );
}

function ActiveBarItems({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return <BarItems items={items} pathname={pathname} />;
}

function BarItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const t = useT();
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href} className="min-w-0">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-1 px-1 text-[0.7rem] text-muted-foreground transition-colors",
                active ? "text-primary" : "hover:text-foreground",
              )}
            >
              <item.icon aria-hidden weight={active ? "fill" : "regular"} className="size-5" />
              <span className="max-w-full truncate">{t(item.label)}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
}
