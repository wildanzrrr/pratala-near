"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";

import { explorer } from "@/lib/explorer";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/locale-provider";

/** "View proof ↗" — the one link every transaction surface carries. */
export function ProofLink({ hash, className, label }: { hash: string; className?: string; label?: string }) {
  const t = useT();
  return (
    <a
      href={explorer.tx(hash)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary",
        className,
      )}
    >
      {label ?? t("common.viewProof")}
      <ArrowSquareOut aria-hidden className="size-3.5" />
    </a>
  );
}

export function AccountLink({ accountId, className }: { accountId: string; className?: string }) {
  return (
    <a
      href={explorer.account(accountId)}
      target="_blank"
      rel="noreferrer"
      className={cn("font-mono text-[0.85em] break-all underline decoration-border underline-offset-4 hover:decoration-primary", className)}
    >
      {accountId}
    </a>
  );
}
