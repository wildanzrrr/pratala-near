"use client";

import { useState } from "react";

import { Prohibit, Storefront, ArrowCounterClockwise, SealCheck } from "@phosphor-icons/react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AmountInput } from "@/components/money/amount-input";
import { MoneyBlock } from "@/components/money/money";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { formatKg, parseUsdc, usdcToDecimal } from "@/lib/near/format";
import {
  useCancelLotMutation,
  useCloseFundingMutation,
  useDelistLotMutation,
  useListLotMutation,
  useUpdatePriceMutation,
} from "@/hooks/mutations/use-list-lot-mutation";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

/** Farmer-only: set price → list, change price, close funding, withdraw, cancel. All FC-key signed. */
export function FarmerActions({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  const { hasFunctionCallKey } = useNear();
  const list = useListLotMutation();
  const update = useUpdatePriceMutation();
  const delist = useDelistLotMutation();
  const close = useCloseFundingMutation();
  const cancel = useCancelLotMutation();
  const [price, setPrice] = useState(lot.price_per_kg !== "0" ? usdcToDecimal(lot.price_per_kg) : "");
  const base = parseUsdc(price);
  const total = base ? (BigInt(base) * BigInt(lot.projected_kg)).toString() : null;
  const priceError = price && !base ? t("lot.priceInvalid") : null;
  const canPrice = (lot.status === "CoopVerified" || lot.status === "Listed") && lot.sold_kg === 0;
  const active = lot.status === "CoopVerified" ? list : update;
  const canClose = lot.status === "Listed" && lot.sold_kg > 0;
  const cancellable = ["Registered", "FieldVerified", "CoopVerified"].includes(lot.status) && lot.sold_kg === 0;

  if (!canPrice && !canClose && !cancellable) return null;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
      <h2 className="font-sans text-base font-medium">{t("lot.actions")}</h2>
      {canPrice ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!base) return;
            active.mutate({ lotId: lot.lot_id, pricePerKg: base });
          }}
        >
          <p className="text-sm text-muted-foreground">{t("lot.listLead")}</p>
          <AmountInput label={t("lot.listTitle")} value={price} onChange={setPrice} error={priceError} unit="USDC/kg" />
          {total ? <MoneyBlock base={total} /> : null}
          <Button type="submit" size="lg" disabled={!base || active.isPending}>
            {active.isPending ? <Spinner data-icon="inline-start" /> : <Storefront data-icon="inline-start" />}
            {lot.status === "CoopVerified" ? t("lot.listCta") : t("lot.updatePrice")}
          </Button>
          <TxStatusLine status={active.status} data={active.data} error={active.error} silent={hasFunctionCallKey} />
        </form>
      ) : null}
      {canClose ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={close.isPending}>
              {close.isPending ? <Spinner data-icon="inline-start" /> : <SealCheck data-icon="inline-start" />}
              {t("lot.closeFunding")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("lot.closeFunding")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("lot.closeFundingConfirm", { sold: formatKg(lot.sold_kg, locale), total: formatKg(lot.projected_kg, locale) })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => close.mutate({ lotId: lot.lot_id })}>{t("lot.closeFunding")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {lot.status === "Listed" && lot.sold_kg === 0 ? (
        <Button variant="outline" disabled={delist.isPending} onClick={() => delist.mutate({ lotId: lot.lot_id })}>
          {delist.isPending ? <Spinner data-icon="inline-start" /> : <ArrowCounterClockwise data-icon="inline-start" />}
          {t("lot.delist")}
        </Button>
      ) : null}
      {cancellable ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={cancel.isPending}>
              <Prohibit data-icon="inline-start" />
              {t("lot.cancel")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("lot.cancel")}</AlertDialogTitle>
              <AlertDialogDescription>{t("lot.cancelConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => cancel.mutate({ lotId: lot.lot_id })}>
                {t("lot.cancel")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

