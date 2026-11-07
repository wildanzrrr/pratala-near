import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

/** App page title block: serif title, one-line lead, optional actions. Fixed rem sizes (Operate mode). */
export function PageHeader({ title, lead, actions, className }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {lead ? <p className="measure text-ink-2">{lead}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("page-max page-x flex flex-col gap-8 py-8 sm:py-12", className)}>{children}</div>;
}
