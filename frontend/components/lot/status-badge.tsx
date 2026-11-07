"use client";

import { CheckCircle, Circle, ClockCountdown, Coins, Prohibit, ArrowUUpLeft, SealCheck, Storefront } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/providers/locale-provider";

import type { Icon } from "@phosphor-icons/react";
import type { Status } from "@/lib/near/types";

const META: Record<Status, { icon: Icon; variant: "outline" | "success" | "warning" | "attention" | "lime" | "secondary" }> = {
  Registered: { icon: Circle, variant: "outline" },
  FieldVerified: { icon: SealCheck, variant: "outline" },
  CoopVerified: { icon: SealCheck, variant: "success" },
  Listed: { icon: Storefront, variant: "lime" },
  Funded: { icon: Coins, variant: "warning" },
  Settled: { icon: CheckCircle, variant: "success" },
  Refunded: { icon: ArrowUUpLeft, variant: "attention" },
  Cancelled: { icon: Prohibit, variant: "secondary" },
};

/** Status is never colour alone: every badge carries its icon and a word. */
export function StatusBadge({ status }: { status: Status }) {
  const t = useT();
  const { icon: IconCmp, variant } = META[status];
  return (
    <Badge variant={variant}>
      <IconCmp data-icon="inline-start" weight="bold" />
      {t(`status.${status}`)}
    </Badge>
  );
}

export function NextStepHint({ status }: { status: Status }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <ClockCountdown aria-hidden className="size-4 shrink-0" />
      {t(`status.next_${status}`)}
    </span>
  );
}
