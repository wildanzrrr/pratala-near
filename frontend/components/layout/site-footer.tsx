import { T } from "@/components/i18n/t";

/** Ft4 · colophon — single sign-off line under the cooperative ledger. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-sunken pb-[calc(var(--pt-bottom-bar-h)+env(safe-area-inset-bottom))] md:pb-0 print:hidden">
      <div className="page-max page-x py-6">
        <p className="font-mono text-xs text-muted-foreground">
          <T k="footer.colophon" />
        </p>
      </div>
    </footer>
  );
}
