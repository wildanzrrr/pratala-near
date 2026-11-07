"use client";

import { useState } from "react";

import { DownloadSimple, Notebook } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiOfflineBanner } from "@/components/common/api-offline-banner";
import { AccountLink, ProofLink } from "@/components/common/explorer-link";
import { EmptyState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { api, isApiUnavailable } from "@/lib/api";
import { formatDateTime, parseUsdc } from "@/lib/near/format";
import { Money } from "@/components/money/money";
import { usePayments } from "@/hooks/queries/use-payments";
import { useNear } from "@/providers/near-provider";
import { useLocale } from "@/providers/locale-provider";

import type { PaymentStatus } from "@/lib/near/types";

const STATUS_VARIANT: Record<PaymentStatus, "success" | "warning" | "attention" | "secondary"> = {
  PAID: "success",
  PENDING: "warning",
  REFUNDED: "attention",
  FAILED: "secondary",
};

/** Bookkeeper's view: one row per money movement, proof link per row, CSV that opens in Excel. */
export function ExportsView() {
  const { t, locale } = useLocale();
  const { signedAccountId } = useNear();
  const [scope, setScope] = useState<"mine" | "all">(signedAccountId ? "mine" : "all");
  const account = scope === "mine" && signedAccountId ? signedAccountId : undefined;
  const payments = usePayments({ account });
  const csv = api.paymentsCsvUrl({ account });

  return (
    <PageBody>
      <PageHeader
        title={t("exports.title")}
        lead={t("exports.lead")}
        actions={
          <Button asChild>
            <a href={csv} download>
              <DownloadSimple data-icon="inline-start" />
              {t("exports.csv")}
            </a>
          </Button>
        }
      />
      {signedAccountId ? (
        <ToggleGroup type="single" variant="outline" size="sm" value={scope} onValueChange={(v) => v && setScope(v as "mine" | "all")} className="justify-start">
          <ToggleGroupItem value="mine">{t("exports.mine")}</ToggleGroupItem>
          <ToggleGroupItem value="all">{t("exports.all")}</ToggleGroupItem>
        </ToggleGroup>
      ) : null}

      {payments.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : payments.isError ? (
        isApiUnavailable(payments.error) ? <ApiOfflineBanner force /> : <EmptyState title={t("states.errorTitle")} body={(payments.error as Error).message} />
      ) : !payments.data.length ? (
        <EmptyState icon={Notebook} title={t("exports.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <Table className="tnum min-w-[52rem]">
            <TableHeader className="bg-sunken">
              <TableRow>
                <TableHead>{t("exports.date")}</TableHead>
                <TableHead>{t("common.lot")}</TableHead>
                <TableHead>{t("exports.type")}</TableHead>
                <TableHead>{t("exports.from")}</TableHead>
                <TableHead>{t("exports.to")}</TableHead>
                <TableHead className="text-right">{t("exports.amount")}</TableHead>
                <TableHead>{t("exports.status")}</TableHead>
                <TableHead>{t("exports.proof")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(p.createdAt, locale)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.lotId ?? "—"}</TableCell>
                  <TableCell>{t(`exports.types.${p.type}`)}</TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    <AccountLink accountId={p.fromAccount} />
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    <AccountLink accountId={p.toAccount} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money base={parseUsdc(p.amount) ?? "0"} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status]}>{t(`exports.statuses.${p.status}`)}</Badge>
                  </TableCell>
                  <TableCell>{p.txHash ? <ProofLink hash={p.txHash} /> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageBody>
  );
}
