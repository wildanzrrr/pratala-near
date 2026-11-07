"use client";

import { useId, useState } from "react";

import { PaperPlaneTilt } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/common/responsive-dialog";
import { canTransfer } from "@/lib/near/contracts";
import { isNearAccountId } from "@/lib/utils";
import { useNftTransferMutation } from "@/hooks/mutations/use-nft-transfer-mutation";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

/** NEP-171 transfer (1 yocto, wallet approval). The refund claim moves with the token. */
export function TransferNftButton({ lot }: { lot: LotView }) {
  const t = useT();
  const { signedAccountId } = useNear();
  const [open, setOpen] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [touched, setTouched] = useState(false);
  const id = useId();
  const transfer = useNftTransferMutation(() => {
    setOpen(false);
    setReceiver("");
    setTouched(false);
  });

  const value = receiver.trim().toLowerCase();
  const error = !value
    ? null
    : !isNearAccountId(value)
      ? t("portfolio.invalidAccount")
      : value === signedAccountId
        ? t("portfolio.selfTransfer")
        : null;
  const allowed = canTransfer(lot);

  return (
    <>
      <Button variant="outline" disabled={!allowed} onClick={() => setOpen(true)} title={allowed ? undefined : t("portfolio.transferBlocked")}>
        <PaperPlaneTilt data-icon="inline-start" />
        {t("lot.transfer")}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={(o) => !transfer.isPending && setOpen(o)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("portfolio.transferTitle", { lot: lot.lot_id })}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("portfolio.transferLead")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form
            id={`${id}-form`}
            className="py-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!value || error) return;
              transfer.mutate({ lotId: lot.lot_id, receiverId: value });
            }}
          >
            <Field data-invalid={touched && error ? true : undefined}>
              <FieldLabel htmlFor={`${id}-receiver`}>{t("portfolio.receiver")}</FieldLabel>
              <Input
                id={`${id}-receiver`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t("portfolio.receiverPlaceholder")}
                value={receiver}
                aria-invalid={touched && error ? true : undefined}
                onChange={(e) => setReceiver(e.target.value)}
                onBlur={() => setTouched(true)}
                className="font-mono"
              />
              {touched && error ? <FieldError>{error}</FieldError> : <FieldDescription>{lot.claim_lock ? t("lot.lockedNote") : " "}</FieldDescription>}
            </Field>
          </form>
          <ResponsiveDialogFooter>
            <Button type="submit" form={`${id}-form`} size="lg" disabled={transfer.isPending || !value || Boolean(error)}>
              {transfer.isPending ? <Spinner data-icon="inline-start" /> : <PaperPlaneTilt data-icon="inline-start" />}
              {t("portfolio.transferCta")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
