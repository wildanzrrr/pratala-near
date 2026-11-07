"use client";

import { useState } from "react";

import { ArrowRight, CheckCircle } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, QueryErrorState } from "@/components/common/states";
import { StatusBadge } from "@/components/lot/status-badge";
import { TaskDialog } from "@/app/verify/_components/task-dialog";
import { formatKg, formatMonth } from "@/lib/near/format";
import { useLotsByStatus } from "@/hooks/queries/use-lots-by-status";
import { useLocale } from "@/providers/locale-provider";

import type { VerifierRole } from "@/lib/roles";
import type { LotView, Status } from "@/lib/near/types";
import type { MessageKey } from "@/lib/i18n/types";

export type TaskKind = "field" | "coop" | "weigh" | "failure";

const QUEUES: Record<VerifierRole, Array<{ kind: TaskKind; status: Status; title: MessageKey }>> = {
  FieldAgent: [{ kind: "field", status: "Registered", title: "verify.queueField" }],
  Coop: [
    { kind: "coop", status: "FieldVerified", title: "verify.queueCoop" },
    { kind: "failure", status: "Funded", title: "verify.queueFailure" },
  ],
  Warehouse: [{ kind: "weigh", status: "Funded", title: "verify.queueWarehouse" }],
};

/** One list per job the role can do; each row opens a camera-first task sheet. */
export function TaskQueue({ role }: { role: VerifierRole }) {
  const [task, setTask] = useState<{ kind: TaskKind; lot: LotView } | null>(null);
  return (
    <div className="flex flex-col gap-10">
      {QUEUES[role].map((q) => (
        <Queue key={q.kind} kind={q.kind} status={q.status} title={q.title} onOpen={(lot) => setTask({ kind: q.kind, lot })} />
      ))}
      <TaskDialog task={task} onClose={() => setTask(null)} />
    </div>
  );
}

function Queue({ kind, status, title, onOpen }: { kind: TaskKind; status: Status; title: MessageKey; onOpen: (lot: LotView) => void }) {
  const { t, locale } = useLocale();
  const lots = useLotsByStatus(status);
  return (
    <section aria-labelledby={`q-${kind}`} className="flex flex-col gap-3">
      <h2 id={`q-${kind}`} className="flex items-center gap-2 font-sans text-lg font-medium">
        {t(title)}
        {lots.data ? <span className="tnum rounded-sm bg-sunken px-1.5 text-sm text-muted-foreground">{lots.data.length}</span> : null}
      </h2>
      {lots.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : lots.isError ? (
        <QueryErrorState error={lots.error} onRetry={() => lots.refetch()} />
      ) : !lots.data.length ? (
        <EmptyState icon={CheckCircle} title={t("verify.queueEmpty")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {lots.data.map((lot) => (
            <li key={lot.lot_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {lot.crop}
                    {lot.variety ? ` · ${lot.variety}` : ""}
                  </span>
                  <StatusBadge status={lot.status} />
                </div>
                <span className="tnum text-sm text-muted-foreground">
                  <span className="font-mono">{lot.lot_id}</span> · {lot.region} · {formatKg(lot.projected_kg, locale)} · {formatMonth(lot.harvest_month, locale)}
                </span>
              </div>
              <Button onClick={() => onOpen(lot)} variant={kind === "failure" ? "outline" : "default"} className="w-full sm:w-auto">
                {t("verify.open")}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
