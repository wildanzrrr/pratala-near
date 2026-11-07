"use client";

import { ArrowDownRight, Wallet } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { formatUsdc } from "@/lib/near/format";
import { useStorageDeposit, useStorageRegistered } from "@/hooks/queries/use-storage-registered";
import { useClaimMutation } from "@/hooks/mutations/use-claim-mutation";
import { useStorageDepositMutation } from "@/hooks/mutations/use-faucet-mutation";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { ClaimKind } from "@/lib/near/types";

const LABEL = { Farmer: "lot.claimPayout", Holder: "lot.claimRefund", Treasury: "lot.claimFee" } as const;

/**
 * One claim (payout / refund / fee). Pre-checks pUSDC registration so the
 * transfer can land; claims themselves are FC-key signed (no popup).
 */
export function ClaimButton({ lotId, kind, amount }: { lotId: string; kind: ClaimKind; amount: string }) {
  const { t, locale } = useLocale();
  const { signedAccountId, hasFunctionCallKey } = useNear();
  const registered = useStorageRegistered(signedAccountId);
  const deposit = useStorageDeposit();
  const activate = useStorageDepositMutation();
  const claim = useClaimMutation(kind);

  if (registered.data === false) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t("checkout.notRegistered")}</p>
        <Button
          variant="outline"
          disabled={activate.isPending}
          onClick={() => activate.mutate({ storageDeposit: deposit.data ?? "1250000000000000000000" })}
        >
          {activate.isPending ? <Spinner data-icon="inline-start" /> : <Wallet data-icon="inline-start" />}
          {t("checkout.activate")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button size="lg" disabled={claim.isPending || amount === "0"} onClick={() => claim.mutate({ lotId })}>
        {claim.isPending ? <Spinner data-icon="inline-start" /> : <ArrowDownRight data-icon="inline-start" />}
        {t(LABEL[kind], { amount: formatUsdc(amount, locale) })}
      </Button>
      <TxStatusLine status={claim.status} data={claim.data} error={claim.error} silent={hasFunctionCallKey} />
    </div>
  );
}
