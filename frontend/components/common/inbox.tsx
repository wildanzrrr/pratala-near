"use client";

import Link from "next/link";

import { Bell, ShieldCheck } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/near/format";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/queries/use-notifications";
import { useMarkReadMutation } from "@/hooks/mutations/use-mark-read-mutation";
import { useSignInBackendMutation } from "@/hooks/mutations/use-sign-in-backend-mutation";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

/** Off-chain inbox (notifications from indexed events). Needs the backend session; degrades to a sign-in prompt. */
export function Inbox() {
  const { t, locale } = useLocale();
  const session = useSession();
  const health = useApiHealth();
  const notes = useNotifications(session.accountId, session.signedInToApi);
  const markRead = useMarkReadMutation(session.accountId ?? "");
  const signIn = useSignInBackendMutation();

  return (
    <section aria-labelledby="inbox-title" className="flex flex-col gap-3">
      <h2 id="inbox-title" className="flex items-center gap-2 font-sans text-lg font-medium">
        <Bell aria-hidden className="size-5 text-muted-foreground" />
        {t("farmer.inboxTitle")}
      </h2>
      {health.isError ? (
        <p className="text-sm text-muted-foreground">{t("states.apiOffline")}</p>
      ) : !session.signedInToApi ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-rule-strong p-3">
          <p className="text-sm text-muted-foreground">{t("wallet.signInBackendLead")}</p>
          <Button variant="outline" size="sm" className="w-fit" disabled={signIn.isPending} onClick={() => signIn.mutate()}>
            {signIn.isPending ? <Spinner data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
            {t("wallet.signInBackend")}
          </Button>
        </div>
      ) : notes.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : !notes.data?.length ? (
        <p className="text-sm text-muted-foreground">{t("farmer.inboxEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {notes.data.slice(0, 8).map((n) => {
            const unread = !n.read && !n.readAt;
            return (
              <li key={n.id} className={cn("flex flex-col gap-1 p-3 text-sm", unread && "bg-accent/40")}>
                <span className={cn(unread && "font-medium")}>{n.title ?? n.kind ?? "—"}</span>
                {n.body ? <span className="text-muted-foreground">{n.body}</span> : null}
                <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {formatDateTime(n.createdAt, locale)}
                  {n.lotId ? (
                    <Link href={`/lot/${encodeURIComponent(n.lotId)}`} className="font-mono text-primary underline underline-offset-4">
                      {n.lotId}
                    </Link>
                  ) : null}
                  {unread ? (
                    <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => markRead.mutate(n.id)}>
                      {t("farmer.markRead")}
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
