"use client";

import { useState } from "react";

import { Gear, Pause, Play, Plus, X } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AccountLink } from "@/components/common/explorer-link";
import { RoleGate } from "@/components/common/role-gate";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { ConnectGate } from "@/components/wallet/connect-gate";
import { isNearAccountId } from "@/lib/utils";
import { useConfig } from "@/hooks/queries/use-config";
import { useRoleMembers } from "@/hooks/queries/use-roles";
import { useAdminMutation } from "@/hooks/mutations/use-admin-mutation";
import { useLocale } from "@/providers/locale-provider";

import type { StoredRole } from "@/lib/near/types";

const ROLES: StoredRole[] = ["FieldAgent", "Coop", "Warehouse"];

/** Owner console: verifier allowlists, fee, treasury, pause. Rendered only for get_config().owner_id. */
export function AdminView() {
  const { t } = useLocale();
  return (
    <PageBody>
      <PageHeader title={t("admin.title")} lead={t("admin.lead")} />
      <ConnectGate>
        <RoleGate roles={["Admin"]} fallback={<EmptyState icon={Gear} title={t("admin.notOwner")} />}>
          <AdminBody />
        </RoleGate>
      </ConnectGate>
    </PageBody>
  );
}

function AdminBody() {
  const { t } = useLocale();
  const config = useConfig();
  const admin = useAdminMutation();
  const [fee, setFee] = useState("");
  const [treasury, setTreasury] = useState("");

  if (config.isPending) return <Skeleton className="h-64 w-full" />;
  if (config.isError) return <QueryErrorState error={config.error} onRetry={() => config.refetch()} />;
  const c = config.data;
  const feeNum = Number.parseInt(fee, 10);
  const feeValid = Number.isInteger(feeNum) && feeNum >= 0 && feeNum <= 1000;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section aria-labelledby="roles-title" className="flex flex-col gap-6">
        <h2 id="roles-title" className="font-sans text-lg font-medium">
          {t("admin.rolesTitle")}
        </h2>
        {ROLES.map((role) => (
          <RoleBlock key={role} role={role} />
        ))}
      </section>
      <aside className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-sans text-base font-medium">{t("admin.feeTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("admin.feeNow", { pct: (c.fee_bps / 100).toString() })}</p>
          <Field>
            <FieldLabel htmlFor="fee">{t("admin.feeBps")}</FieldLabel>
            <Input id="fee" type="number" inputMode="numeric" min={0} max={1000} className="tnum" value={fee} onChange={(e) => setFee(e.target.value)} placeholder={String(c.fee_bps)} />
          </Field>
          <Button disabled={!feeValid || admin.isPending} onClick={() => admin.mutate({ type: "setFee", feeBps: feeNum })}>
            {t("common.save")}
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-sans text-base font-medium">{t("admin.treasuryTitle")}</h2>
          <AccountLink accountId={c.treasury} className="text-sm" />
          <Field>
            <FieldLabel htmlFor="treasury">{t("admin.accountId")}</FieldLabel>
            <Input id="treasury" className="font-mono" autoCapitalize="none" value={treasury} onChange={(e) => setTreasury(e.target.value)} />
          </Field>
          <Button disabled={!isNearAccountId(treasury) || admin.isPending} onClick={() => admin.mutate({ type: "setTreasury", accountId: treasury.trim() })}>
            {t("common.save")}
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-sans text-base font-medium">{t("admin.pauseTitle")}</h2>
          <Badge variant={c.paused ? "attention" : "success"}>{c.paused ? t("admin.paused") : t("admin.active")}</Badge>
          <Button variant={c.paused ? "default" : "outline"} disabled={admin.isPending} onClick={() => admin.mutate({ type: "setPaused", paused: !c.paused })}>
            {c.paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
            {c.paused ? t("admin.unpause") : t("admin.pause")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("admin.claimFeeLead")}</p>
        </div>
      </aside>
    </div>
  );
}

function RoleBlock({ role }: { role: StoredRole }) {
  const { t } = useLocale();
  const members = useRoleMembers(role);
  const admin = useAdminMutation();
  const [account, setAccount] = useState("");
  const value = account.trim().toLowerCase();
  const valid = isNearAccountId(value);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="font-sans text-base font-medium">{t(`roles.${role}`)}</h3>
      {members.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <ul className="flex flex-col gap-1">
          {(members.data ?? []).map((m) => (
            <li key={m} className="flex items-center justify-between gap-2 text-sm">
              <AccountLink accountId={m} />
              <Button variant="ghost" size="sm" disabled={admin.isPending} onClick={() => admin.mutate({ type: "removeRole", role, accountId: m })}>
                <X data-icon="inline-start" />
                {t("admin.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) admin.mutate({ type: "addRole", role, accountId: value }, { onSuccess: () => setAccount("") });
        }}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor={`add-${role}`}>{t("admin.accountId")}</FieldLabel>
          <Input id={`add-${role}`} className="font-mono" autoCapitalize="none" spellCheck={false} placeholder="name.near" value={account} onChange={(e) => setAccount(e.target.value)} />
          {account && !valid ? <FieldDescription className="text-destructive">{t("portfolio.invalidAccount")}</FieldDescription> : null}
        </Field>
        <Button type="submit" disabled={!valid || admin.isPending}>
          {admin.isPending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {t("admin.add")}
        </Button>
      </form>
    </div>
  );
}
