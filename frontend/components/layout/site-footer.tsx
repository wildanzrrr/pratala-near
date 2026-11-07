import Link from "next/link";

import { T } from "@/components/i18n/t";
import { Wordmark } from "@/components/layout/wordmark";
import { env } from "@/lib/env";

/** Ft4 · dense colophon — the cooperative ledger's sign-off: contracts, network, type, photo credit. */
export function SiteFooter() {
  const links = [
    { href: "/market", k: "nav.market" },
    { href: "/activity", k: "nav.activity" },
    { href: "/faucet", k: "nav.faucet" },
    { href: "/exports", k: "nav.exports" },
  ] as const;
  return (
    <footer className="mt-auto border-t border-border bg-sunken pb-[calc(var(--pt-bottom-bar-h)+env(safe-area-inset-bottom))] md:pb-0 print:hidden">
      <div className="page-max page-x flex flex-col gap-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Wordmark />
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  <T k={l.k} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-[90ch] font-mono text-xs leading-relaxed text-muted-foreground">
          <T
            k="footer.colophon"
            vars={{ lots: env.lotsContractId, pusdc: env.pusdcContractId, network: env.network, rpc: env.rpcUrl.replace(/^https?:\/\//, "") }}
          />{" "}
          <a href="https://unsplash.com/@rdcl" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
            unsplash.com/@rdcl
          </a>
        </p>
      </div>
    </footer>
  );
}
