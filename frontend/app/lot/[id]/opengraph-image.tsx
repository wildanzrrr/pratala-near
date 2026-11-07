import { ImageResponse } from "next/og";

import { formatKg, formatMonth, formatUsdc } from "@/lib/near/format";
import { serverT } from "@/lib/i18n";
import { getLotForSeo } from "@/lib/server/lots";

export const alt = "Pratala harvest lot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* OG renders outside the CSS pipeline, so the token values are restated here (tokens.css: paper, ink, green, lime, muted). */
const C = { paper: "#f5f2ea", ink: "#17221b", green: "#1f5a37", lime: "#d7ef7f", muted: "#566159", rule: "#cfd2c8" };

/** Social card for the pay link: crop, weight, status, total. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getLotForSeo(decodeURIComponent(id));
  const t = serverT("id");
  const title = lot ? `${lot.crop}${lot.variety ? ` · ${lot.variety}` : ""}` : `Lot ${decodeURIComponent(id)}`;
  const facts = lot ? [formatKg(lot.projected_kg), formatMonth(lot.harvest_month), lot.region] : [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.paper, color: C.ink, padding: 72, fontSize: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, background: C.green, color: C.paper, borderRadius: "14px 14px 14px 4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>P</div>
          <div style={{ fontSize: 40 }}>pratala</div>
          <div style={{ marginLeft: "auto", color: C.muted, fontSize: 28 }}>{lot?.lot_id ?? ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, lineHeight: 1.05 }}>{title}</div>
          <div style={{ display: "flex", gap: 28, color: C.muted }}>{facts.map((f) => <span key={f}>{f}</span>)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `2px solid ${C.rule}`, paddingTop: 28 }}>
          <div style={{ display: "flex", background: C.lime, padding: "8px 18px", borderRadius: 6 }}>{lot ? t(`status.${lot.status}`) : "—"}</div>
          <div style={{ display: "flex", fontSize: 44 }}>{lot && lot.price_per_kg !== "0" ? `${formatUsdc(lot.funding_total)} pUSDC` : ""}</div>
        </div>
      </div>
    ),
    size,
  );
}
