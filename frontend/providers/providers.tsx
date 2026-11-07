"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TxRedirectHandler } from "@/components/common/tx-redirect-handler";
import { LocaleProvider } from "@/providers/locale-provider";
import { NearProvider } from "@/providers/near-provider";
import { QueryProvider } from "@/providers/query-provider";

import type { ReactNode } from "react";

/** The single client boundary mounted by app/layout.tsx. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <QueryProvider>
        <NearProvider>
          <TooltipProvider delayDuration={800}>
            {children}
            <TxRedirectHandler />
            <Toaster position="top-center" richColors={false} closeButton />
          </TooltipProvider>
        </NearProvider>
      </QueryProvider>
    </LocaleProvider>
  );
}
