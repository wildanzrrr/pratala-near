import { T } from "@/components/i18n/t";

/** Honest limits, set like the notes at the foot of a ledger page. */
export function Notes() {
  const notes = ["landing.note1", "landing.note2", "landing.note3"] as const;
  return (
    <section aria-labelledby="notes-title" className="page-max page-x pb-16 md:pb-24">
      <div className="border-t-2 border-double border-border pt-8">
        <h2 id="notes-title" className="text-lg">
          <T k="landing.notesTitle" />
        </h2>
        <ol className="mt-4 grid grid-cols-1 gap-4 text-sm text-ink-2 md:grid-cols-3">
          {notes.map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="font-mono text-muted-foreground">{i + 1}.</span>
              <span>
                <T k={k} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
