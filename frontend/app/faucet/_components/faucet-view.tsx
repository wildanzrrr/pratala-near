"use client";

import { Coins } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { MoneyBlock } from "@/components/money/money";
import { TxStatusLine } from "@/components/money/tx-status-line";
import { QueryErrorState } from "@/components/common/states";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { env } from "@/lib/env";
import { usePusdcBalance } from "@/hooks/queries/use-pusdc-balance";
import { useStorageDeposit } from "@/hooks/queries/use-storage-registered";
import { useFaucetMutation } from "@/hooks/mutations/use-faucet-mutation";
import { useNear } from "@/providers/near-provider";
import { useT } from "@/providers/locale-provider";

/** One transaction to pUSDC: storage_deposit (if needed) + faucet(1,000). */
export function FaucetView() {
  const t = useT();
  return (
    <PageBody className="max-w-2xl">
      <PageHeader title={t("faucet.title")} lead={t("faucet.lead")} />
      <ConnectGate>
        <FaucetBody />
      </ConnectGate>
    </PageBody>
  );
}

function FaucetBody() {
  const t = useT();
  const { signedAccountId } = useNear();
  const balance = usePusdcBalance(signedAccountId);
  const deposit = useStorageDeposit();
  const faucet = useFaucetMutation();

  return (
    <div className="flex flex-col gap-6 rounded-md border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t("faucet.balance")}</span>
        {balance.isPending ? <Skeleton className="h-10 w-40" /> : balance.isError ? <QueryErrorState error={balance.error} /> : <MoneyBlock base={balance.data} size="lg" />}
      </div>
      <p className="text-sm text-ink-2">{t("faucet.oneTx")}</p>
      <Button
        size="lg"
        className="w-full sm:w-fit"
        disabled={faucet.isPending || env.demoFixtures}
        onClick={() => faucet.mutate({ storageDeposit: deposit.data ?? "1250000000000000000000" })}
      >
        {faucet.isPending ? <Spinner data-icon="inline-start" /> : <Coins data-icon="inline-start" />}
        {t("faucet.getCta")}
      </Button>
      <TxStatusLine status={faucet.status} data={faucet.data} error={faucet.error} />
      <p className="font-mono text-xs text-muted-foreground">{env.pusdcContractId}</p>
    </div>
  );
}
