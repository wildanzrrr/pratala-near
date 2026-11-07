"use client";

import { useState } from "react";

import { Prohibit, Storefront, ArrowCounterClockwise } from "@phosphor-icons/react";

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
import { parseUsdc, usdcToDecimal } from "@/lib/near/format";
import {
  useCancelLotMutation,
  useDelistLotMutation,
  useListLotMutation,
  useUpdatePriceMutation,
} from "@/hooks/mutations/use-list-lot-mutation";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

/** Farmer-only: set price → list, change price, withdraw, cancel. All FC-key signed. */
export function FarmerActions({ lot }: { lot: LotView }) {
  const t = useT();
  const { hasFunctionCallKey } = useNear();
  const list = useListLotMutation();
  const update = useUpdatePriceMutation();
  const delist = useDelistLotMutation();
  const cancel = useCancelLotMutation();
  const [price, setPrice] = useState(lot.price_per_kg !== "0" ? usdcToDecimal(lot.price_per_kg) : "");
  const base = parseUsdc(price);
  const total = base ? (BigInt(base) * BigInt(lot.projected_kg)).toString() : null;
  const priceError = price && !base ? t("lot.priceInvalid") : null;
  const active = lot.status === "CoopVerified" ? list : update;
  const canPrice = lot.status === "CoopVerified" || lot.status === "Listed";
  const cancellable = ["Registered", "FieldVerified", "CoopVerified"].includes(lot.status);

  if (!canPrice && !cancellable) return null;

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
          <AmountInput label={t("lot.listTitle")} value={price} onChange={setPrice} error={priceError} unit="pUSDC/kg" />
          {total ? <MoneyBlock base={total} /> : null}
          <Button type="submit" size="lg" disabled={!base || active.isPending}>
            {active.isPending ? <Spinner data-icon="inline-start" /> : <Storefront data-icon="inline-start" />}
            {lot.status === "CoopVerified" ? t("lot.listCta") : t("lot.updatePrice")}
          </Button>
          <TxStatusLine status={active.status} data={active.data} error={active.error} silent={hasFunctionCallKey} />
        </form>
      ) : null}
      {lot.status === "Listed" ? (
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
