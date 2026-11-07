"use client";

import Link from "next/link";

import { Warning } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useT } from "@/providers/locale-provider";

/** Route-level error boundary: say what broke, offer a retry and a way home. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <div className="page-max page-x flex flex-1 flex-col items-start justify-center gap-4 py-24">
      <Warning aria-hidden className="size-8 text-attention-foreground" />
      <h1 className="text-4xl">{t("states.errorTitle")}</h1>
      <p className="text-ink-2">{error.message || t("states.errorBody")}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>{t("common.retry")}</Button>
        <Button asChild variant="outline">
          <Link href="/">{t("states.home")}</Link>
        </Button>
      </div>
    </div>
  );
}
