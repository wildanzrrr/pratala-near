"use client";

import { createContext, use } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/ui/use-media-query";

import type { ReactNode } from "react";

/**
 * Compound overlay: bottom drawer on phones (thumb reach), centred dialog from
 * 40 rem. Always carries a Title for a11y.
 */
const DesktopContext = createContext(false);

export function ResponsiveDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 40rem)");
  const Root = desktop ? Dialog : Drawer;
  return (
    <DesktopContext value={desktop}>
      <Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    </DesktopContext>
  );
}

/**
 * NEAR Connect mounts the wallet's own modal (`.hot-connector-popup`) on <body>, outside our
 * portal. A click or focus there must not count as "outside" — otherwise our dialog closes
 * (or fights for focus) while the user is approving a transaction in the wallet.
 */
function keepOpenForWalletPopup(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.closest(".hot-connector-popup")) event.preventDefault();
}

export function ResponsiveDialogContent({ children, className }: { children: ReactNode; className?: string }) {
  const desktop = use(DesktopContext);
  return desktop ? (
    <DialogContent
      className={cn("max-h-[90dvh] overflow-y-auto sm:max-w-lg", className)}
      onInteractOutside={keepOpenForWalletPopup}
    >
      {children}
    </DialogContent>
  ) : (
    <DrawerContent className={cn("max-h-[92dvh]", className)} onInteractOutside={keepOpenForWalletPopup}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
    </DrawerContent>
  );
}

export function ResponsiveDialogHeader({ children }: { children: ReactNode }) {
  const desktop = use(DesktopContext);
  return desktop ? <DialogHeader>{children}</DialogHeader> : <DrawerHeader className="px-0 text-left">{children}</DrawerHeader>;
}

export function ResponsiveDialogTitle({ children }: { children: ReactNode }) {
  const desktop = use(DesktopContext);
  const cls = "font-heading text-xl font-medium";
  return desktop ? <DialogTitle className={cls}>{children}</DialogTitle> : <DrawerTitle className={cls}>{children}</DrawerTitle>;
}

export function ResponsiveDialogDescription({ children }: { children: ReactNode }) {
  const desktop = use(DesktopContext);
  return desktop ? <DialogDescription>{children}</DialogDescription> : <DrawerDescription>{children}</DrawerDescription>;
}

export function ResponsiveDialogFooter({ children }: { children: ReactNode }) {
  const desktop = use(DesktopContext);
  return desktop ? <DialogFooter>{children}</DialogFooter> : <DrawerFooter className="px-0">{children}</DrawerFooter>;
}
