"use client";

import { Suspense } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navFor } from "@/components/layout/nav-items";
import type { NavItem } from "@/components/layout/nav-items";
import { Wordmark } from "@/components/layout/wordmark";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { AccountMenu } from "@/components/wallet/account-menu";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/providers/locale-provider";

export function isActive(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * N12 · one real nav bar. Sign-in state drives which destinations appear.
 */
export function SiteHeader() {
  const t = useT();
  const session = useSession();

  const items = navFor({
    connected: Boolean(session.accountId),
    intent: session.intent,
    verifier: session.verifierRoles.length > 0,
    admin: session.isAdmin,
  });

  return (
    <header className="sticky top-0 z-(--pt-z-sticky) print:hidden">
      <div className="border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
        <div className="page-max page-x flex h-(--pt-bar-h) items-center gap-4">
          <Wordmark />
          <nav aria-label={t("nav.primary")} className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            <Suspense fallback={<NavLinks items={items} pathname="" />}>
              <ActiveNavLinks items={items} />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <AccountMenu />
          </div>
        </div>
      </div>
    </header>
  );
}

function ActiveNavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return <NavLinks items={items} pathname={pathname} />;
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const t = useT();
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-sm px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              active && "text-foreground after:absolute after:inset-x-3 after:-bottom-[0.6rem] after:h-0.5 after:bg-primary",
            )}
          >
            {t(item.label)}
          </Link>
        );
      })}
    </>
  );
}
