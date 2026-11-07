"use client";

import { formatIdr, formatUsdc } from "@/lib/near/format";
import { cn } from "@/lib/utils";
import { useLocale } from "@/providers/locale-provider";

/**
 * pUSDC amount with the ≈ Rp line at the labelled demo rate. Variants are
 * explicit components rather than boolean props.
 */
export function Money({ base, className, fractionDigits = 2 }: { base: string | bigint | null | undefined; className?: string; fractionDigits?: number }) {
  const { locale } = useLocale();
  return (
    <span className={cn("tnum font-mono whitespace-nowrap", className)}>
      {formatUsdc(base, locale, fractionDigits)}
      <span className="ml-1 font-sans text-[0.75em] text-muted-foreground">pUSDC</span>
    </span>
  );
}

export function Rupiah({ base, className }: { base: string | bigint | null | undefined; className?: string }) {
  const { locale, t } = useLocale();
  return (
    <span className={cn("tnum text-sm whitespace-nowrap text-muted-foreground", className)}>
      ≈ {formatIdr(base, locale)} <span className="text-xs">({t("common.demoRate")})</span>
    </span>
  );
}

/** Amount stacked over its ≈ Rp line — the default way money is shown to farmers. */
export function MoneyBlock({ base, size = "md" }: { base: string | bigint | null | undefined; size?: "md" | "lg" }) {
  return (
    <span className="flex flex-col gap-0.5">
      <Money base={base} className={size === "lg" ? "text-2xl sm:text-3xl" : "text-lg"} />
      <Rupiah base={base} />
    </span>
  );
}
