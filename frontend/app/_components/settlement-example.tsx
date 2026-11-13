import { Info } from "@phosphor-icons/react/dist/ssr";

import { T } from "@/components/i18n/t";

import type { MessageKey } from "@/lib/i18n/types";

/**
 * F3 · tabular spec sheet — the contract's settlement rule worked through with
 * the INTERFACES.md reference numbers. Labelled as an example, not data.
 */
const ROWS: Array<{ label: MessageKey; value: string; tone?: "farmer" | "holder" | "muted" }> = [
  { label: "landing.mathFunded", value: "450.00" },
  { label: "landing.mathDelivered", value: "900 kg", tone: "muted" },
  { label: "landing.mathGross", value: "405.00" },
  { label: "landing.mathFee", value: "8.10", tone: "muted" },
  { label: "landing.mathFarmer", value: "396.90", tone: "farmer" },
  { label: "landing.mathHolder", value: "45.00", tone: "holder" },
];

export function SettlementExample() {
  return (
    <section aria-labelledby="math-title" className="bg-card">
      <div className="page-max page-x grid grid-cols-1 gap-10 py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:py-20">
        <div className="flex flex-col gap-3">
          <h2 id="math-title" className="text-h2">
            <T k="landing.mathTitle" />
          </h2>
          <p className="text-ink-2">
            <T k="landing.mathLead" />
          </p>
          <p className="mt-2 flex gap-2 text-sm text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-attention-foreground" />
            <span>
              <T k="landing.mathNote" />
            </span>
          </p>
        </div>
        <table className="tnum w-full border-collapse self-start text-sm sm:text-base">
          <caption className="sr-only">
            <T k="landing.mathTitle" />
          </caption>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-3 pr-4 text-left font-normal text-ink-2">
                  <T k={row.label} />
                </th>
                <td
                  className={
                    row.tone === "farmer"
                      ? "py-3 text-right font-mono text-lg whitespace-nowrap text-primary"
                      : row.tone === "holder"
                        ? "py-3 text-right font-mono text-lg whitespace-nowrap text-attention-foreground"
                        : row.tone === "muted"
                          ? "py-3 text-right font-mono whitespace-nowrap text-muted-foreground"
                          : "py-3 text-right font-mono whitespace-nowrap"
                  }
                >
                  {row.value}
                  {row.value.endsWith("kg") ? null : <span className="ml-1.5 text-xs text-muted-foreground">USDC</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
