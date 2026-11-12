"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { X } from "@phosphor-icons/react";

import { navFor } from "@/components/layout/nav-items";
import type { NavItem } from "@/components/layout/nav-items";
import { Wordmark } from "@/components/layout/wordmark";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { AccountMenu } from "@/components/wallet/account-menu";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/providers/locale-provider";

const BANNER_KEY = "pratala:banner-dismissed";
const bannerListeners = new Set<() => void>();

function readDismissed() {
  try {
    return localStorage.getItem(BANNER_KEY) === "1";
  } catch {
    return false;
  }
}

export function isActive(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * N12 · announcement banner + one real nav bar. The banner states the honest
 * testnet status; it retracts on scroll-down, returns on scroll-up, and can be
 * dismissed for good.
 */
export function SiteHeader() {
  const t = useT();
  const session = useSession();
  const [compact, setCompact] = useState(false);
  const dismissed = useSyncExternalStore(
    (l) => {
      bannerListeners.add(l);
      return () => bannerListeners.delete(l);
    },
    readDismissed,
    () => false,
  );

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 48) setCompact(false);
        else if (y > last + 4) setCompact(true);
        else if (y < last - 4) setCompact(false);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const items = navFor({
    connected: Boolean(session.accountId),
    intent: session.intent,
    verifier: session.verifierRoles.length > 0,
    admin: session.isAdmin,
  });

  const dismiss = () => {
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      /* ignore */
    }
    bannerListeners.forEach((l) => l());
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-(--pt-z-sticky) print:hidden",
        "transition-transform duration-(--pt-dur-long) ease-(--pt-ease-out) motion-reduce:transition-none",
        compact && !dismissed && "-translate-y-(--pt-banner-h)",
      )}
    >
      {!dismissed ? (
        <div className="relative flex h-(--pt-banner-h) items-center justify-center gap-3 bg-band px-10 text-xs text-band-foreground sm:text-sm">
          <p className="min-w-0 truncate">
            <span aria-hidden className="mr-2 inline-block size-1.5 rounded-full bg-lime align-middle" />
            <span className="hidden sm:inline">{t("nav.bannerText")} </span>
            <span className="sm:hidden">{t("common.testnet")} · </span>
            <Link href="/faucet" className="font-medium whitespace-nowrap underline decoration-lime underline-offset-4">
              {t("nav.bannerLink")}
            </Link>
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("nav.dismissBanner")}
            className="absolute right-1 grid size-9 place-items-center rounded-sm text-band-muted transition-colors hover:text-band-foreground"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
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
