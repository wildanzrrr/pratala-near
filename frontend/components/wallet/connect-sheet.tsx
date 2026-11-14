"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowRight, EnvelopeSimple, ShieldCheck, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/common/responsive-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { setConnectSheetOpen, useConnectSheetOpen } from "@/components/wallet/connect-store";
import { WalletRejectedError, classifyTxError } from "@/lib/near/errors";
import { loadLocalProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useNear } from "@/providers/near-provider";
import { env } from "@/lib/env";
import { useT } from "@/providers/locale-provider";

import type { WalletOption } from "@/providers/near-provider";

const RECOMMENDED = [
  { id: "hot-wallet", name: "wallet.hotName", desc: "wallet.hotDesc", badge: "wallet.hotBadge" },
  { id: "meteor-wallet", name: "wallet.meteorName", desc: "wallet.meteorDesc", badge: "wallet.meteorBadge" },
] as const;

/**
 * The one connect surface. Email/Google SSO is the hero — the account, the key
 * and the network costs are all handled for the user (docs/WALLETS.md §1).
 * Until the NEAR Auth client id is configured the SSO button stays visible but
 * disabled and labelled temporarily unavailable. The two recommended NEAR
 * wallets sit right below it; every other wallet stays collapsed behind
 * "Other options".
 */
export function ConnectSheet() {
  const open = useConnectSheetOpen();
  const t = useT();
  const router = useRouter();
  const { connect, connectEmail, wallets, walletsReady } = useNear();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ssoReady = Boolean(env.fastauthClientId);

  const byId = new Map(wallets.map((w) => [w.id, w]));
  const recommendedIds = new Set<string>(RECOMMENDED.map((r) => r.id));
  const others = wallets.filter((w) => !recommendedIds.has(w.id));
  const available = others.filter((w) => w.supportsNetwork);
  const unavailable = others.filter((w) => !w.supportsNetwork);

  async function finish(accountId: string) {
    toast.success(t("wallet.signedIn", { account: accountId }));
    if (accountId && !loadLocalProfile(accountId) && window.location.pathname === "/") router.push("/onboarding");
  }

  // The login window (Auth0/NEAR Connect) must not open behind our sheet: it is a
  // modal dialog that sets `pointer-events: none` on <body> and traps focus — so
  // close it before handing off, and reopen only on failure.
  async function chooseEmail() {
    setError(null);
    setPending("email");
    setConnectSheetOpen(false);
    try {
      // The page redirects to the login window; /auth/callback finishes the
      // sign-in (account creation, funding, backend session) and routes on.
      await connectEmail();
    } catch (e) {
      const err = classifyTxError(e);
      if (!(err instanceof WalletRejectedError)) {
        setError(err.message);
        setConnectSheetOpen(true);
      }
    } finally {
      setPending(null);
    }
  }

  async function choose(walletId: string) {
    setError(null);
    setPending(walletId);
    setConnectSheetOpen(false);
    try {
      const accountId = await connect(walletId);
      await finish(accountId);
    } catch (e) {
      const err = classifyTxError(e);
      if (!(err instanceof WalletRejectedError)) {
        setError(err.message);
        setConnectSheetOpen(true);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setConnectSheetOpen(next);
        if (!next) setError(null);
      }}
    >
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("wallet.sheetTitle")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{ssoReady ? t("wallet.sheetLead") : t("wallet.sheetLeadWallets")}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <section aria-labelledby="wallets-email" className="flex flex-col gap-2">
            <h3 id="wallets-email" className="sr-only">{t("wallet.emailTitle")}</h3>
            <button
              type="button"
              onClick={ssoReady ? chooseEmail : undefined}
              disabled={!ssoReady || Boolean(pending)}
              aria-busy={pending === "email"}
              aria-disabled={!ssoReady || undefined}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border-2 border-primary bg-accent/70 p-4 text-left",
                "transition-[border-color,background-color,transform] duration-(--pt-dur-short) ease-(--pt-ease-out)",
                "hover:bg-accent active:translate-y-px disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                {pending === "email" ? <Spinner className="text-primary-foreground" /> : <EnvelopeSimple className="size-5" weight="bold" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t("wallet.emailTitle")}</span>
                  {ssoReady ? (
                    <Badge variant="lime">{t("wallet.emailBadge")}</Badge>
                  ) : (
                    <Badge variant="attention">{t("wallet.emailUnavailable")}</Badge>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{ssoReady ? t("wallet.emailDesc") : t("wallet.emailDisabledNote")}</span>
              </span>
            </button>
          </section>

          {error ? (
            <Alert variant="destructive">
              <Warning />
              <AlertTitle>{t("wallet.failed")}</AlertTitle>
              <AlertDescription>{error ?? t("wallet.failedHint")}</AlertDescription>
            </Alert>
          ) : null}

          <section aria-labelledby="wallets-recommended" className="flex flex-col gap-2">
            <h3 id="wallets-recommended" className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("wallet.recommended")}
            </h3>
            <ul className="flex flex-col gap-2">
              {RECOMMENDED.map((r) => {
                const manifest = byId.get(r.id);
                return (
                  <li key={r.id}>
                    <WalletRow
                      icon={manifest?.icon}
                      name={t(r.name)}
                      description={t(r.desc)}
                      badge={t(r.badge)}
                      emphasis
                      pending={pending === r.id}
                      disabled={Boolean(pending) && pending !== r.id}
                      loading={!walletsReady}
                      onSelect={() => choose(r.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          <details className="group">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-90" />
              {walletsReady ? `${t("wallet.others")} · ${others.length}` : t("wallet.others")}
            </summary>
            <div className="pt-3">
              {!walletsReady ? (
                <div className="flex flex-col gap-2" aria-label={t("wallet.loadingWallets")}>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {available.map((w) => (
                    <li key={w.id}>
                      <CompactWalletRow
                        wallet={w}
                        pending={pending === w.id}
                        disabled={Boolean(pending) && pending !== w.id}
                        onSelect={() => choose(w.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {walletsReady && unavailable.length > 0 ? (
                <details className="group text-sm">
                  <summary className="cursor-pointer py-2 text-muted-foreground transition-colors hover:text-foreground">
                    {t("wallet.mainnetOnly")} · {unavailable.length}
                  </summary>
                  <p className="pb-2 text-muted-foreground">{unavailable.map((w) => w.name).join(" · ")}</p>
                </details>
              ) : null}
            </div>
          </details>

          <p className="flex gap-2 rounded-md bg-sunken p-3 text-sm text-ink-2">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{t("wallet.fcNote")}</span>
          </p>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function WalletIcon({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element -- icons come from the NEAR Connect manifest (any origin)
    <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} className="shrink-0 rounded-md bg-sunken object-contain" />
  ) : (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-md bg-sunken font-heading text-lg text-primary"
    >
      {name.charAt(0)}
    </span>
  );
}

function WalletRow(props: {
  icon?: string;
  name: string;
  description: string;
  badge: string;
  emphasis?: boolean;
  pending: boolean;
  disabled: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={props.onSelect}
      disabled={props.disabled}
      aria-busy={props.pending}
      className={cn(
        "group flex w-full items-start gap-3 rounded-md border border-border bg-card p-3 text-left transition-[border-color,background-color,transform] duration-(--pt-dur-short) ease-(--pt-ease-out)",
        "hover:border-primary/50 hover:bg-accent/60 active:translate-y-px disabled:opacity-50",
        props.pending && "border-primary bg-accent/60",
      )}
    >
      {props.loading ? <Skeleton className="size-10 shrink-0" /> : <WalletIcon src={props.icon} name={props.name} />}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{props.name}</span>
          <Badge variant="lime">{props.badge}</Badge>
        </span>
        <span className="text-sm text-muted-foreground">{props.description}</span>
      </span>
      <span className="mt-2 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5">
        {props.pending ? <Spinner aria-label={t("wallet.connecting")} /> : <ArrowRight aria-hidden className="size-4" />}
      </span>
    </button>
  );
}

function CompactWalletRow({
  wallet,
  pending,
  disabled,
  onSelect,
}: {
  wallet: WalletOption;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-busy={pending}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60 disabled:opacity-50"
    >
      <WalletIcon src={wallet.icon} name={wallet.name} size={28} />
      <span className="min-w-0 flex-1 truncate">{wallet.name}</span>
      {pending ? <Spinner /> : null}
    </button>
  );
}
