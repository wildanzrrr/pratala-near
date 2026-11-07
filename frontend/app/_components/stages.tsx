import { T } from "@/components/i18n/t";
import { Badge } from "@/components/ui/badge";

import type { MessageKey } from "@/lib/i18n/types";
import type { Status } from "@/lib/near/types";

const STAGES: Array<{ n: string; title: MessageKey; body: MessageKey; who: MessageKey; status: Status }> = [
  { n: "01", title: "landing.stage1Title", body: "landing.stage1Body", who: "landing.stage1Who", status: "Registered" },
  { n: "02", title: "landing.stage2Title", body: "landing.stage2Body", who: "landing.stage2Who", status: "FieldVerified" },
  { n: "03", title: "landing.stage3Title", body: "landing.stage3Body", who: "landing.stage3Who", status: "CoopVerified" },
  { n: "04", title: "landing.stage4Title", body: "landing.stage4Body", who: "landing.stage4Who", status: "Funded" },
  { n: "05", title: "landing.stage5Title", body: "landing.stage5Body", who: "landing.stage5Who", status: "Settled" },
];

/** F4 · step sequence — the macrostructure's spine. A real five-step lifecycle, numbered because it is ordinal. */
export function Stages() {
  return (
    <section id="cara-kerja" aria-labelledby="stages-title" className="page-max page-x scroll-mt-28 py-16 md:py-24">
      <div className="flex max-w-2xl flex-col gap-3">
        <h2 id="stages-title" className="text-h2">
          <T k="landing.stagesTitle" />
        </h2>
        <p className="text-ink-2">
          <T k="landing.stagesLead" />
        </p>
      </div>
      <ol className="mt-12 flex flex-col">
        {STAGES.map((stage, i) => (
          <li key={stage.n} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-6">
            <div className="flex flex-col items-center">
              <span className="grid size-10 place-items-center rounded-sm border border-primary/40 bg-card font-mono text-sm text-primary sm:size-12">
                {stage.n}
              </span>
              {i < STAGES.length - 1 ? <span aria-hidden className="w-px flex-1 bg-border" /> : null}
            </div>
            <div className="flex flex-col gap-2 pb-10 md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-x-10 md:pb-14">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-muted-foreground">
                  <T k={stage.who} />
                </p>
                <h3 className="text-xl sm:text-2xl">
                  <T k={stage.title} />
                </h3>
              </div>
              <div className="flex flex-col items-start gap-3 md:pt-6">
                <p className="text-ink-2">
                  <T k={stage.body} />
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <T k="landing.recorded" />
                  <Badge variant={stage.status === "Settled" ? "success" : "outline"}>
                    <T k={`status.${stage.status}`} />
                  </Badge>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
