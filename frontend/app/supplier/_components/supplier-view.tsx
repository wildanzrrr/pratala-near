"use client";

import { useState } from "react";

import { Package, PencilSimple, Plus, Receipt } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import { ProofLink } from "@/components/common/explorer-link";
import { EmptyState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/money/money";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { ListingFormDialog } from "@/app/supplier/_components/listing-form";
import { formatDateTime, parseUsdc } from "@/lib/near/format";
import { useApiHealth } from "@/hooks/queries/use-api-health";
import { useListings } from "@/hooks/queries/use-listings";
import { useOrders } from "@/hooks/queries/use-orders";
import { useSignInBackendMutation } from "@/hooks/mutations/use-sign-in-backend-mutation";
import { useSession } from "@/hooks/use-session";
import { useLocale } from "@/providers/locale-provider";

import type { InputListing } from "@/lib/near/types";

export function SupplierView() {
  const { t } = useLocale();
  return (
    <PageBody>
      <PageHeader title={t("supplier.title")} lead={t("supplier.lead")} />
      <ConnectGate>
        <SupplierBody />
      </ConnectGate>
    </PageBody>
  );
}

function SupplierBody() {
  const { t, locale } = useLocale();
  const session = useSession();
  const health = useApiHealth();
  const listings = useListings();
  const orders = useOrders(session.accountId, session.signedInToApi);
  const signIn = useSignInBackendMutation();
  const [editing, setEditing] = useState<InputListing | null>(null);
  const [open, setOpen] = useState(false);
  const mine = (listings.data ?? []).filter((l) => l.sellerId === session.accountId);

  if (health.isError) {
    return (
      <div className="flex flex-col gap-3">
        <ApiOfflineBanner force />
        <p className="text-sm text-muted-foreground">{t("supplier.needsBackend")}</p>
      </div>
    );
  }
  if (!session.signedInToApi) {
    return (
      <EmptyState
        icon={Package}
        title={t("supplier.needsBackend")}
        body={t("wallet.signInBackendLead")}
        action={
          <Button disabled={signIn.isPending} onClick={() => signIn.mutate()}>
            {signIn.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t("wallet.signInBackend")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section aria-labelledby="listings-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="listings-title" className="font-sans text-lg font-medium">
            {t("supplier.listingsTitle")}
          </h2>
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            {t("supplier.newListing")}
          </Button>
        </div>
        {listings.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : !mine.length ? (
          <EmptyState icon={Package} title={t("supplier.listingsEmpty")} />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
            {mine.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {l.title}
                    <Badge variant="outline">{t(`market.categories.${l.category}`)}</Badge>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("market.stock", { n: l.stock, unit: l.unit })} · {l.region}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Money base={parseUsdc(l.priceUsdc) ?? "0"} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.edit")}
                    onClick={() => {
                      setEditing(l);
                      setOpen(true);
                    }}
                  >
                    <PencilSimple />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="orders-title" className="flex flex-col gap-3">
        <h2 id="orders-title" className="flex items-center gap-2 font-sans text-lg font-medium">
          <Receipt aria-hidden className="size-5 text-muted-foreground" />
          {t("supplier.ordersTitle")}
        </h2>
        {orders.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : !orders.data?.length ? (
          <p className="text-sm text-muted-foreground">{t("supplier.ordersEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card text-sm">
            {orders.data.map((o) => (
              <li key={o.id} className="flex flex-col gap-1 p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{o.memo}</span>
                  <Badge variant={o.status === "PAID" ? "success" : "warning"}>{o.status}</Badge>
                </span>
                <Money base={o.amountBase ?? parseUsdc(o.amount) ?? "0"} />
                <span className="text-xs text-muted-foreground">{formatDateTime(o.createdAt, locale)}</span>
                {o.txHash ? <ProofLink hash={o.txHash} className="text-xs" /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <ListingFormDialog open={open} onOpenChange={setOpen} listing={editing} />
    </div>
  );
}
