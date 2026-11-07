"use client";

import { ShareNetwork } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/providers/locale-provider";

/** Native share sheet on phones, copy-to-clipboard elsewhere. The lot page is the pay link. */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const t = useT();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        if (navigator.share) {
          await navigator.share({ title, text: t("lot.shareLead"), url }).catch(() => undefined);
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          toast.success(t("common.linkCopied"));
        } catch {
          toast.message(url);
        }
      }}
    >
      <ShareNetwork data-icon="inline-start" />
      {t("common.share")}
    </Button>
  );
}
