"use client";

import { Plant, SealCheck, Storefront, Coins } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/locale-provider";

import type { Icon } from "@phosphor-icons/react";
import type { MessageKey } from "@/lib/i18n/types";
import type { Intent } from "@/lib/near/types";

const OPTIONS: Array<{ value: Intent; title: MessageKey; body: MessageKey; icon: Icon; invite?: boolean }> = [
  { value: "farmer", title: "onboarding.roleFarmer", body: "onboarding.roleFarmerBody", icon: Plant },
  { value: "buyer", title: "onboarding.roleBuyer", body: "onboarding.roleBuyerBody", icon: Coins },
  { value: "verifier", title: "onboarding.roleVerifier", body: "onboarding.roleVerifierBody", icon: SealCheck, invite: true },
  { value: "supplier", title: "onboarding.roleSupplier", body: "onboarding.roleSupplierBody", icon: Storefront },
];

/** Four big, plain-language choices — native radios, so keyboard and screen readers just work. */
export function RolePicker({ value, onChange }: { value: Intent | null; onChange: (v: Intent) => void }) {
  const t = useT();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 font-heading text-2xl">{t("onboarding.roleTitle")}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex cursor-pointer gap-3 rounded-md border bg-card p-4 transition-[border-color,background-color] duration-(--pt-dur-short)",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked ? "border-primary bg-accent/50" : "border-border hover:border-primary/40",
              )}
            >
              <input type="radio" name="intent" value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
              <o.icon aria-hidden weight={checked ? "fill" : "regular"} className="mt-0.5 size-6 shrink-0 text-primary" />
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {t(o.title)}
                  {o.invite ? <Badge variant="outline">{t("onboarding.invite")}</Badge> : null}
                </span>
                <span className="text-sm text-muted-foreground">{t(o.body)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
