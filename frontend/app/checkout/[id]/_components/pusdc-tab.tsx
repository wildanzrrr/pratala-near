"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CheckCircle, Coins, LockSimple, SignIn, Wallet } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AmountInput } from "@/components/money/amount-input";
import { Money } from "@/components/money/money";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { openConnectSheet } from "@/components/wallet/connect-store";
import { env } from "@/lib/env";
import { formatUsdc, parseUsdc, toBig, usdcToDecimal } from "@/lib/near/format";
import { cn } from "@/lib/utils";
import { usePusdcBalance } from "@/hooks/queries/use-pusdc-balance";
import { useStorageDeposit, useStorageRegistered } from "@/hooks/queries/use-storage-registered";
import { useFaucetMutation, useStorageDepositMutation } from "@/hooks/mutations/use-faucet-mutation";
import { useFundLotMutation } from "@/hooks/mutations/use-fund-lot-mutation";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { ReactNode } from "react";
import type { LotView } from "@/lib/near/types";

/** Live testnet path: sign in → balance & registration → one ft_transfer_call. */
export function PusdcTab({ lot }: { lot: LotView }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { signedAccountId, loading } = useNear();
  const balance = usePusdcBalance(signedAccountId);
  const registered = useStorageRegistered(signedAccountId);
  const deposit = useStorageDeposit();
  const faucet = useFaucetMutation();
  const activate = useStorageDepositMutation();
  const fund = useFundLotMutation((result) => {
    if (result.hash) {
      router.push(`/receipt/${result.hash}?signer=${encodeURIComponent(signedAccountId)}&lot=${encodeURIComponent(lot.lot_id)}`);
    }
  });

  // The buyer chooses how much to send; the contract (escrow.rs ft_on_transfer)
  // requires amount >= funding_total and refunds any excess, so the input is
  // free above the lot price. Null until the user types — the default follows
  // the lot, so re-navigation between lots never shows a stale amount.
  const [amountText, setAmountText] = useState<string | null>(null);
  const amountInput = amountText ?? usdcToDecimal(lot.funding_total);
  const parsed = parseUsdc(amountInput);
  const pay = parsed !== null ? toBig(parsed) : 0n;
  const need = toBig(lot.funding_total);
  const have = toBig(balance.data);
  const short = need > have ? need - have : 0n;
  const payable = parsed !== null && pay >= need;
  const shortInput = payable && balance.data !== undefined && pay > have ? pay - have : 0n;
  const amountError = !payable
    ? parsed === null
      ? t("checkout.amountInvalid")
      : t("checkout.amountMin", { amount: formatUsdc(lot.funding_total, locale) })
    : shortInput > 0n
      ? t("checkout.short", { amount: formatUsdc(shortInput, locale) })
      : null;
  const payWith = payable && shortInput === 0n && parsed !== null ? parsed : lot.funding_total;
  const step1 = Boolean(signedAccountId);
  const step2 = step1 && registered.data === true && balance.isSuccess && short === 0n;
  const fixtures = env.demoFixtures;

  return (
    <ol className="flex flex-col gap-4">
      <Step n={1} title={t("checkout.step1")} done={step1} active={!step1}>
        {loading ? (
          <Skeleton className="h-11 w-40" />
        ) : step1 ? (
          <p className="font-mono text-sm break-all text-ink-2">{signedAccountId}</p>
        ) : (
          <Button onClick={openConnectSheet}>
            <SignIn data-icon="inline-start" />
            {t("wallet.connectLong")}
          </Button>
        )}
      </Step>

      <Step n={2} title={t("checkout.step2")} done={step2} active={step1 && !step2}>
        {!step1 ? null : balance.isPending || registered.isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : registered.data === false ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-2">{t("checkout.notRegistered")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={faucet.isPending}
                onClick={() => faucet.mutate({ storageDeposit: deposit.data ?? "1250000000000000000000" })}
              >
                {faucet.isPending ? <Spinner data-icon="inline-start" /> : <Coins data-icon="inline-start" />}
                {t("faucet.getCta")}
              </Button>
              <Button
                variant="outline"
                disabled={activate.isPending}
                onClick={() => activate.mutate({ storageDeposit: deposit.data ?? "1250000000000000000000" })}
              >
                <Wallet data-icon="inline-start" />
                {t("checkout.activate")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{t("checkout.balance")}</dt>
                <dd>{balance.isError ? "—" : <Money base={balance.data} />}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{t("checkout.needed")}</dt>
                <dd>
                  <Money base={lot.funding_total} />
                </dd>
              </div>
            </dl>
            {short > 0n ? (
              <div className="flex flex-col gap-2 rounded-md bg-warning p-3 text-sm text-warning-foreground">
                <span>{t("checkout.short", { amount: formatUsdc(short, locale) })}</span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={faucet.isPending} onClick={() => faucet.mutate({ storageDeposit: deposit.data ?? "1250000000000000000000" })}>
                    {faucet.isPending ? <Spinner data-icon="inline-start" /> : <Coins data-icon="inline-start" />}
                    {t("faucet.getCta")}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/faucet">{t("checkout.getTest")}</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Step>

      <Step n={3} title={t("checkout.step3")} done={fund.isSuccess} active={step2}>
        {step2 || fixtures ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <AmountInput label={t("checkout.youPay")} value={amountInput} onChange={setAmountText} error={amountError} />
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">{t("checkout.youGet")}</span>
                <p className="text-ink-2">{t("checkout.youGetBody", { lot: lot.lot_id })}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("checkout.amountFloor", { amount: formatUsdc(lot.funding_total, locale) })}
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <LockSimple aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              {t("money.escrowBody")}
            </p>
            <Button
              size="lg"
              className="w-full sm:w-fit"
              disabled={!step2 || !payable || shortInput > 0n || fund.isPending}
              onClick={() => fund.mutate({ lotId: lot.lot_id, amount: payWith })}
            >
              {fund.isPending ? <Spinner data-icon="inline-start" /> : <Coins data-icon="inline-start" />}
              {fund.isPending ? t("checkout.paying") : t("checkout.pay", { amount: formatUsdc(payWith, locale) })}
            </Button>
            <TxStatusLine status={fund.status} data={fund.data} error={fund.error} />
          </div>
        ) : null}
      </Step>
    </ol>
  );
}

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode }) {
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={cn(
        "flex gap-4 rounded-md border bg-card p-4 transition-colors",
        active ? "border-primary/50" : "border-border",
        !active && !done && "opacity-70",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full border font-mono text-sm",
          done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary bg-lime text-lime-foreground" : "border-rule-strong",
        )}
      >
        {done ? <CheckCircle aria-hidden weight="bold" className="size-4" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
        <h2 className="font-sans text-base font-medium">{title}</h2>
        {children}
      </div>
    </li>
  );
}
