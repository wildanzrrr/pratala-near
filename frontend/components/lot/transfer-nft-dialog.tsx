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
import { isNearAccountId } from "@/lib/utils";
import { useNftTransferMutation } from "@/hooks/mutations/use-nft-transfer-mutation";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

import type { LotView } from "@/lib/near/types";

/**
 * NEP-171 transfer (1 yocto, wallet approval). Works for the lot certificate and for
 * kg share NFTs — the refund claim moves with the token either way.
 */
export function TransferNftButton({
  lot,
  tokenId,
  label,
}: {
  lot: LotView;
  /** Defaults to the lot certificate; share rows pass "lot-N:M". */
  tokenId?: string;
  label?: string;
}) {
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

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PaperPlaneTilt data-icon="inline-start" />
        {label ?? t("lot.transfer")}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={(o) => !transfer.isPending && setOpen(o)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("portfolio.transferTitle", { lot: tokenId ?? lot.lot_id })}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("portfolio.transferLead")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form
            id={`${id}-form`}
            className="py-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (!value || error) return;
              transfer.mutate({ tokenId: tokenId ?? lot.lot_id, lotId: lot.lot_id, receiverId: value });
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
              {touched && error ? <FieldError>{error}</FieldError> : <FieldDescription>{lot.claim_lock ? t("lot.lockedNote") : " "}</FieldDescription>}
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
