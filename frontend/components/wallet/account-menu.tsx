"use client";

import Link from "next/link";

import { ArrowSquareOut, CaretDown, Copy, Lightning, LightningSlash, SignIn, SignOut, User } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCOUNT_LINKS } from "@/components/layout/nav-items";
import { openConnectSheet } from "@/components/wallet/connect-store";
import { explorer } from "@/lib/explorer";
import { shortAccount } from "@/lib/near/format";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/providers/locale-provider";

/** Signed out: one "Sign in" button. Signed in: account, signing mode, role links, sign out. */
export function AccountMenu() {
  const t = useT();
  const session = useSession();

  if (session.loading) return <Skeleton className="h-9 w-24" aria-label={t("common.loading")} />;

  if (!session.accountId) {
    return (
      <Button size="sm" onClick={openConnectSheet}>
        <SignIn data-icon="inline-start" />
        {t("wallet.connect")}
      </Button>
    );
  }

  const name = session.profile?.displayName || shortAccount(session.accountId);
  const roleLabels = session.roles.map((r) => t(`roles.${r}`));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[11rem]">
          <span aria-hidden className="grid size-5 place-items-center rounded-sm bg-lime font-heading text-xs text-lime-foreground">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{name}</span>
          <CaretDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
          <span className="font-mono text-xs break-all text-foreground">{session.accountId}</span>
          {roleLabels.length ? <span className="text-xs text-muted-foreground">{roleLabels.join(" · ")}</span> : null}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {session.hasFunctionCallKey ? (
              <Lightning aria-hidden className="size-3.5 text-primary" />
            ) : (
              <LightningSlash aria-hidden className="size-3.5" />
            )}
            {session.hasFunctionCallKey ? t("wallet.silentOn") : t("wallet.silentOff")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(session.accountId!)}>
            <Copy />
            {t("wallet.copyAccount")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={explorer.account(session.accountId)} target="_blank" rel="noreferrer">
              <ArrowSquareOut />
              {t("wallet.viewOnExplorer")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/onboarding">
              <User />
              {t("onboarding.stepProfile")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {ACCOUNT_LINKS.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <item.icon />
                {t(item.label)}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => session.signOut()}>
          <SignOut />
          {t("wallet.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
