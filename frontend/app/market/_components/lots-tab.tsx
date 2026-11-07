"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { MagnifyingGlass, Plant } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { LotCard, LotCardSkeleton } from "@/components/lot/lot-card";
import { useLots } from "@/hooks/queries/use-lots";
import { useT } from "@/providers/locale-provider";

import type { LotView, Status } from "@/lib/near/types";

const GROUPS: Record<string, Status[]> = {
  open: ["Listed"],
  verifying: ["Registered", "FieldVerified", "CoopVerified"],
  funded: ["Funded"],
  done: ["Settled", "Refunded"],
};

const ORDER: Status[] = ["Listed", "CoopVerified", "FieldVerified", "Registered", "Funded", "Settled", "Refunded", "Cancelled"];

export function LotsTab() {
  const t = useT();
  const lots = useLots();
  const [group, setGroup] = useState<string>("all");
  const [crop, setCrop] = useState<string>("all");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());

  const crops = useMemo(() => [...new Set((lots.data ?? []).map((l) => l.crop))].sort(), [lots.data]);
  const visible = useMemo(() => {
    const allowed = group === "all" ? null : new Set(GROUPS[group]);
    return (lots.data ?? [])
      .filter((l) => l.status !== "Cancelled" || group === "all")
      .filter((l) => !allowed || allowed.has(l.status))
      .filter((l) => crop === "all" || l.crop === crop)
      .filter((l) => !q || l.region.toLowerCase().includes(q) || l.crop.toLowerCase().includes(q) || l.lot_id.includes(q))
      .toSorted((a: LotView, b: LotView) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.created_at_ms - a.created_at_ms);
  }, [lots.data, group, crop, q]);

  const filtered = group !== "all" || crop !== "all" || q !== "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={group}
          onValueChange={(v) => setGroup(v || "all")}
          aria-label={t("market.filterStatus")}
          className="flex-wrap justify-start"
        >
          <ToggleGroupItem value="all">{t("market.allStatuses")}</ToggleGroupItem>
          <ToggleGroupItem value="open">{t("market.groupOpen")}</ToggleGroupItem>
          <ToggleGroupItem value="verifying">{t("market.groupVerifying")}</ToggleGroupItem>
          <ToggleGroupItem value="funded">{t("market.groupFunded")}</ToggleGroupItem>
          <ToggleGroupItem value="done">{t("market.groupDone")}</ToggleGroupItem>
        </ToggleGroup>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:w-[28rem]">
          <Select value={crop} onValueChange={setCrop}>
            <SelectTrigger aria-label={t("market.filterCrop")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("market.allCrops")}</SelectItem>
                {crops.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <InputGroup>
            <InputGroupAddon>
              <MagnifyingGlass />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("market.filterRegion")}
              aria-label={t("market.filterRegion")}
            />
          </InputGroup>
        </div>
      </div>

      {lots.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <LotCardSkeleton />
          <LotCardSkeleton />
          <LotCardSkeleton />
        </div>
      ) : lots.isError ? (
        <QueryErrorState error={lots.error} onRetry={() => lots.refetch()} />
      ) : visible.length === 0 ? (
        filtered ? (
          <EmptyState
            title={t("market.emptyFiltered")}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setGroup("all");
                  setCrop("all");
                  setQuery("");
                }}
              >
                {t("market.clearFilters")}
              </Button>
            }
          />
        ) : (
          <EmptyState icon={Plant} title={t("market.emptyTitle")} body={t("market.emptyBody")} />
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("market.count", { n: visible.length })}
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((lot) => (
              <li key={lot.lot_id} className="flex">
                <LotCard lot={lot} className="w-full" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
