"use client";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/common/responsive-dialog";
import { CoopTask } from "@/app/verify/_components/coop-task";
import { FailureTask } from "@/app/verify/_components/failure-task";
import { FieldTask } from "@/app/verify/_components/field-task";
import { WeighTask } from "@/app/verify/_components/weigh-task";
import { formatKg } from "@/lib/near/format";
import { useLocale } from "@/providers/locale-provider";

import type { TaskKind } from "@/app/verify/_components/task-queue";
import type { LotView } from "@/lib/near/types";

const TITLE = { field: "verify.fieldTitle", coop: "verify.coopTitle", weigh: "verify.weighTitle", failure: "verify.failureTitle" } as const;

/** Bottom sheet on phones: the whole task fits under one thumb. */
export function TaskDialog({ task, onClose }: { task: { kind: TaskKind; lot: LotView } | null; onClose: () => void }) {
  const { t, locale } = useLocale();
  return (
    <ResponsiveDialog open={task !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        {task ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t(TITLE[task.kind], { lot: task.lot.lot_id })}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {task.lot.crop}
                {task.lot.variety ? ` · ${task.lot.variety}` : ""} · {task.lot.region} · {formatKg(task.lot.projected_kg, locale)}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="py-2">
              {task.kind === "field" ? (
                <FieldTask lot={task.lot} onDone={onClose} />
              ) : task.kind === "coop" ? (
                <CoopTask lot={task.lot} onDone={onClose} />
              ) : task.kind === "weigh" ? (
                <WeighTask lot={task.lot} onDone={onClose} />
              ) : (
                <FailureTask lot={task.lot} onDone={onClose} />
              )}
            </div>
          </>
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
