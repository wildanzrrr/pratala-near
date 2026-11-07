"use client";

import { ArrowUUpLeft, Check, Prohibit } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { useT } from "@/providers/locale-provider";

import type { Status } from "@/lib/near/types";

const PATH: Status[] = ["Registered", "FieldVerified", "CoopVerified", "Listed", "Funded", "Settled"];

/**
 * The 8-status lifecycle as one line: six happy-path steps, with Refunded and
 * Cancelled shown as the branch they actually are. Vertical on phones,
 * horizontal from md.
 */
export function StatusStepper({ status, className }: { status: Status; className?: string }) {
  const t = useT();
  const branch = status === "Refunded" ? "Funded" : status === "Cancelled" ? null : undefined;
  const reachedIndex =
    status === "Refunded" ? PATH.indexOf("Funded") : status === "Cancelled" ? -1 : PATH.indexOf(status);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <ol aria-label={t("status.stepperLabel")} className="grid grid-cols-1 gap-0 md:grid-cols-6">
        {PATH.map((step, i) => {
          const done = i < reachedIndex || (i === reachedIndex && step === "Settled");
          const current = i === reachedIndex && step !== "Settled" && status !== "Refunded";
          const stopped = branch === "Funded" && step === "Settled";
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className="relative flex items-center gap-3 py-1.5 md:flex-col md:items-start md:gap-2 md:py-0"
            >
              <span className="relative flex items-center md:w-full">
                <span
                  className={cn(
                    "z-[1] grid size-6 shrink-0 place-items-center rounded-full border text-[0.7rem]",
                    done && "border-primary bg-primary text-primary-foreground",
                    current && "border-primary bg-lime text-lime-foreground ring-4 ring-lime/40",
                    !done && !current && "border-rule-strong bg-card text-muted-foreground",
                    stopped && "border-attention-foreground/60 text-attention-foreground",
                  )}
                >
                  {done ? <Check weight="bold" className="size-3.5" /> : <span className="font-mono">{i + 1}</span>}
                </span>
                {i < PATH.length - 1 ? (
                  <span
                    aria-hidden
                    className={cn("absolute top-1/2 left-6 hidden h-px w-[calc(100%-1.5rem)] md:block", i < reachedIndex ? "bg-primary" : "bg-border")}
                  />
                ) : null}
              </span>
              <span className={cn("text-sm", current ? "font-medium text-foreground" : done ? "text-ink-2" : "text-muted-foreground")}>
                {t(`status.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>
      {status === "Refunded" || status === "Cancelled" ? (
        <p className="flex items-center gap-2 rounded-md bg-attention px-3 py-2 text-sm text-attention-foreground">
          {status === "Refunded" ? <ArrowUUpLeft aria-hidden className="size-4" /> : <Prohibit aria-hidden className="size-4" />}
          <span className="font-medium">{t(`status.${status}`)}</span>
          <span>· {t(`status.next_${status}`)}</span>
        </p>
      ) : null}
    </div>
  );
}
