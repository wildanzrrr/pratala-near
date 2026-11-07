import { T } from "@/components/i18n/t";
import { BottomBar } from "@/components/layout/bottom-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ConnectSheet } from "@/components/wallet/connect-sheet";

import type { ReactNode } from "react";

/** Role-aware chrome around every route: N12 header, content, Ft4 colophon, phone bottom bar. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-(--pt-z-toast) rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        <T k="common.skip" />
      </a>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      <BottomBar />
      <ConnectSheet />
    </>
  );
}
