"use client";

import { useState } from "react";

import { Check, Copy } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useT } from "@/providers/locale-provider";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label ?? t("common.copy")}
      data-state={copied ? "success" : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — the value is visible anyway */
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
