"use client";

import { useMemo, useState } from "react";

import { ArrowsLeftRight, Info } from "@phosphor-icons/react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import { isApiUnavailable } from "@/lib/api";
import { usdcToDecimal } from "@/lib/near/format";
import { useIntentsQuote } from "@/hooks/queries/use-intents-quote";
import { useIntentsTokens } from "@/hooks/queries/use-intents-tokens";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { IntentsQuoteRequest, LotView } from "@/lib/near/types";

const CHAIN_LABEL: Record<string, string> = {
  near: "NEAR", eth: "Ethereum", arb: "Arbitrum", base: "Base", sol: "Solana", bsc: "BNB Chain", op: "Optimism",
  pol: "Polygon", ton: "TON", tron: "TRON", btc: "Bitcoin", avax: "Avalanche", sui: "Sui", aptos: "Aptos",
  stellar: "Stellar", xrp: "XRP Ledger", doge: "Dogecoin", zec: "Zcash", ltc: "Litecoin", gnosis: "Gnosis",
};

/** Mirror of the backend rule: 1Click swaps only on mainnet, so testnet accounts cannot receive. */
const TESTNET_ACCOUNT = /(?:^|\.)(?:testnet|betanet)$/i;

/**
 * "Pay from another chain": a real NEAR Intents 1Click quote (mainnet, dry:true)
 * through the backend proxy. Honest banner: demo contracts are on testnet, so
 * no deposit address is created and nothing moves.
 */
export function IntentsTab({ lot }: { lot: LotView }) {
  const { t } = useLocale();
  const { signedAccountId } = useNear();
  const tokens = useIntentsTokens();
  const [chain, setChain] = useState("base");
  const [assetId, setAssetId] = useState("");
  const [amount, setAmount] = useState(usdcToDecimal(lot.funding_total));
  // Prefilled with the signed-in account (a testnet id) so the mainnet-only
  // constraint is visible immediately; the buyer swaps in any mainnet name.
  const [recipientText, setRecipientText] = useState<string | null>(null);
  const recipient = recipientText ?? signedAccountId ?? "";
  const [refundTo, setRefundTo] = useState("");
  const [request, setRequest] = useState<IntentsQuoteRequest | null>(null);
  const quote = useIntentsQuote(request);

  const chains = useMemo(
    () => [...new Set((tokens.data ?? []).map((tk) => tk.blockchain))].sort((a, b) => (CHAIN_LABEL[a] ?? a).localeCompare(CHAIN_LABEL[b] ?? b)),
    [tokens.data],
  );
  const chainTokens = useMemo(
    () => (tokens.data ?? []).filter((tk) => tk.blockchain === chain).toSorted((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokens.data, chain],
  );
  const destination = useMemo(() => (tokens.data ?? []).find((tk) => tk.blockchain === "near" && tk.symbol === "USDC"), [tokens.data]);
  const origin = chainTokens.find((tk) => tk.assetId === assetId) ?? chainTokens.find((tk) => tk.symbol === "USDC") ?? chainTokens[0];

  const recipientOk = recipient.trim().length >= 2 && !TESTNET_ACCOUNT.test(recipient.trim());
  const ready = Boolean(
    origin && destination && Number(amount.replace(",", ".")) > 0 && refundTo.trim().length >= 8 && recipientOk,
  );
  const q = quote.data?.quote?.quote;

  return (
    <div className="flex flex-col gap-5">
      <Alert className="border-attention-foreground/30 bg-attention text-attention-foreground">
        <Info />
        <AlertDescription className="text-attention-foreground">{t("checkout.intentsBanner")}</AlertDescription>
      </Alert>

      {tokens.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : tokens.isError ? (
        isApiUnavailable(tokens.error) ? (
          <div className="flex flex-col gap-2">
            <ApiOfflineBanner force />
            <p className="text-sm text-muted-foreground">{t("checkout.tokensUnavailable")}</p>
          </div>
        ) : (
          <p className="text-sm text-destructive">{(tokens.error as Error).message}</p>
        )
      ) : (
        <form
          className="flex flex-col gap-5 rounded-md border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready || !origin || !destination) return;
            setRequest({
              originAsset: origin.assetId,
              destinationAsset: destination.assetId,
              amount: amount.replace(",", "."),
              recipient: recipient.trim(),
              refundTo: refundTo.trim(),
              slippageTolerance: 100,
              dry: true,
            });
          }}
        >
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("checkout.from")}</FieldLabel>
              <Select
                value={chain}
                onValueChange={(v) => {
                  setChain(v);
                  setAssetId("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {chains.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CHAIN_LABEL[c] ?? c.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("checkout.asset")}</FieldLabel>
              <Select value={origin?.assetId ?? ""} onValueChange={setAssetId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {chainTokens.map((tk) => (
                      <SelectItem key={tk.assetId} value={tk.assetId}>
                        {tk.symbol}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="intents-amount">{t("checkout.amount")}</FieldLabel>
              <Input id="intents-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum font-mono" />
            </Field>
            <Field data-invalid={!recipientOk && recipient.trim() !== "" ? true : undefined}>
              <FieldLabel htmlFor="intents-recipient">{t("checkout.recipient")}</FieldLabel>
              <Input
                id="intents-recipient"
                autoCapitalize="none"
                spellCheck={false}
                value={recipient}
                onChange={(e) => setRecipientText(e.target.value)}
                placeholder="name.near"
                className="font-mono"
                aria-invalid={!recipientOk && recipient.trim() !== "" ? true : undefined}
              />
              {!recipientOk && recipient.trim() !== "" ? (
                <FieldError>{t("checkout.recipientTestnet")}</FieldError>
              ) : (
                <FieldDescription>{t("checkout.recipientHint")}</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="intents-refund">{t("checkout.refundTo")}</FieldLabel>
              <Input
                id="intents-refund"
                autoCapitalize="none"
                spellCheck={false}
                value={refundTo}
                onChange={(e) => setRefundTo(e.target.value)}
                placeholder="0x… / bc1… / name.near"
                className="font-mono"
              />
              <FieldDescription>{t("checkout.refundHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <Button type="submit" variant="outline" size="lg" className="w-full sm:w-fit" disabled={!ready || quote.isFetching}>
            {quote.isFetching ? <Spinner data-icon="inline-start" /> : <ArrowsLeftRight data-icon="inline-start" />}
            {quote.isFetching ? t("checkout.quoting") : t("checkout.getQuote")}
          </Button>
        </form>
      )}

      {quote.isError ? <p className="text-sm text-destructive">{quote.error.message}</p> : null}
      {q ? (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-md border border-primary/30 bg-card p-4">
          <h3 className="font-sans text-base font-medium">{t("checkout.quoteTitle")}</h3>
          <dl className="tnum grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("checkout.quoteIn")}</dt>
              <dd className="font-mono">
                {q.amountInFormatted ?? q.amountIn} {origin?.symbol}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("checkout.quoteOut")}</dt>
              <dd className="font-mono">{q.amountOutFormatted ?? q.amountOut} USDC</dd>
            </div>
            {q.timeEstimate ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{t("checkout.quoteTime")}</dt>
                <dd>{t("checkout.seconds", { n: q.timeEstimate })}</dd>
              </div>
            ) : null}
          </dl>
          {quote.data?.feeNotice ? <p className="text-xs text-muted-foreground">{quote.data.feeNotice}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
