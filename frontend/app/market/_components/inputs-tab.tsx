"use client";

import { useState } from "react";

import Link from "next/link";

import { Package, ShoppingCart } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/common/responsive-dialog";
import { EmptyState } from "@/components/common/states";
import { Money, Rupiah } from "@/components/money/money";
import { openConnectSheet } from "@/components/wallet/connect-store";
import { isApiUnavailable } from "@/lib/api";
import { formatUsdc, parseUsdc } from "@/lib/near/format";
import { useListings } from "@/hooks/queries/use-listings";
import { useOrderMutation } from "@/hooks/mutations/use-order-mutation";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { InputListing } from "@/lib/near/types";

/** F6 · product cards — farm inputs sold for pUSDC straight to the shop's account. */
export function InputsTab() {
  const { t } = useLocale();
  const listings = useListings();
  const [buying, setBuying] = useState<InputListing | null>(null);

  if (listings.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }
  if (listings.isError) {
    return isApiUnavailable(listings.error) ? (
      <ApiOfflineBanner force />
    ) : (
      <EmptyState icon={Package} title={t("states.errorTitle")} body={(listings.error as Error).message} />
    );
  }
  if (!listings.data.length) {
    return (
      <EmptyState
        icon={Package}
        title={t("market.inputsEmptyTitle")}
        body={t("market.inputsEmptyBody")}
        action={
          <Button asChild variant="outline">
            <Link href="/supplier">{t("market.openSupplier")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.data.map((item) => (
          <li key={item.id} className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-sans text-lg font-medium">{item.title}</h3>
              <Badge variant="outline">{t(`market.categories.${item.category}`)}</Badge>
            </div>
            <p className="line-clamp-3 text-sm text-ink-2">{item.description}</p>
            <p className="text-sm text-muted-foreground">
              {item.region} · {t("market.stock", { n: item.stock, unit: item.unit })}
            </p>
            <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3">
              <div className="flex flex-col">
                <Money base={parseUsdc(item.priceUsdc) ?? "0"} />
                <span className="text-xs text-muted-foreground">{t("market.perUnit", { unit: item.unit })}</span>
              </div>
              <Button size="sm" onClick={() => setBuying(item)} disabled={item.stock <= 0}>
                <ShoppingCart data-icon="inline-start" />
                {t("market.buy")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <BuyDialog listing={buying} onClose={() => setBuying(null)} />
    </>
  );
}

function BuyDialog({ listing, onClose }: { listing: InputListing | null; onClose: () => void }) {
  const { t, locale } = useLocale();
  const { signedAccountId } = useNear();
  const order = useOrderMutation();
  const [qty, setQty] = useState("1");
  const n = Math.max(1, Math.min(Number.parseInt(qty, 10) || 1, listing?.stock ?? 1));
  const unitBase = listing ? (parseUsdc(listing.priceUsdc) ?? "0") : "0";
  const total = (BigInt(unitBase) * BigInt(n)).toString();

  return (
    <ResponsiveDialog open={listing !== null} onOpenChange={(o) => !o && !order.isPending && onClose()}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{listing?.title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{listing?.description}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Field>
            <FieldLabel htmlFor="qty">{t("market.qty")}</FieldLabel>
            <Input id="qty" type="number" inputMode="numeric" min={1} max={listing?.stock} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-0.5">
            <Money base={total} className="text-xl" />
            <Rupiah base={total} />
          </div>
        </div>
        <ResponsiveDialogFooter>
          {signedAccountId ? (
            <Button
              size="lg"
              disabled={order.isPending || !listing}
              onClick={() => listing && order.mutate({ listing, qty: n }, { onSuccess: onClose })}
            >
              {order.isPending ? <Spinner data-icon="inline-start" /> : <ShoppingCart data-icon="inline-start" />}
              {t("market.orderPay", { amount: formatUsdc(total, locale) })}
            </Button>
          ) : (
            <Button size="lg" onClick={openConnectSheet}>
              {t("wallet.connectLong")}
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
