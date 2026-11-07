/**
 * Money and number formatting. pUSDC has 6 decimals and is handled as BigInt
 * end to end — never through floating point. "≈ Rp" uses a fixed demo rate
 * (NEXT_PUBLIC_DEMO_IDR_RATE) and must always be labelled as such in the UI.
 */
import { env } from "@/lib/env";

import type { Locale } from "@/lib/i18n/types";

export const PUSDC_DECIMALS = 6;
const SCALE = 10n ** BigInt(PUSDC_DECIMALS);

const intlLocale = (locale: Locale) => (locale === "id" ? "id-ID" : "en-US");

export function toBig(value: string | bigint | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return /^-?\d+$/.test(value) ? BigInt(value) : 0n;
}

/** "450000000" → "450,00" (id) / "450.00" (en). `fractionDigits` 0–6. */
export function formatUsdc(base: string | bigint | null | undefined, locale: Locale = "id", fractionDigits = 2): string {
  const value = toBig(base);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  let text = nf.format(whole);
  if (fractionDigits > 0) {
    const digits = frac.toString().padStart(PUSDC_DECIMALS, "0").slice(0, fractionDigits);
    text += (locale === "id" ? "," : ".") + digits;
  }
  return (negative ? "−" : "") + text;
}

/** Decimal text typed by a user → base units string; null when invalid. Accepts "," or "." as decimal mark. */
export function parseUsdc(input: string): string | null {
  const text = input.trim().replace(/\s/g, "");
  if (!text) return null;
  const normalised = text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text.replace(/,/g, "");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalised)) return null;
  const [whole, fraction = ""] = normalised.split(".");
  return (BigInt(whole) * SCALE + BigInt(fraction.padEnd(PUSDC_DECIMALS, "0") || "0")).toString();
}

/** Base units → plain decimal string with "." (for inputs and API payloads), trailing zeros trimmed. */
export function usdcToDecimal(base: string | bigint): string {
  const value = toBig(base);
  const whole = value / SCALE;
  const frac = (value % SCALE).toString().padStart(PUSDC_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** ≈ Rp at the demo rate. Returns e.g. "Rp 7.200.000". */
export function formatIdr(base: string | bigint | null | undefined, locale: Locale = "id"): string {
  const rupiah = (toBig(base) * BigInt(Math.round(env.demoIdrRate))) / SCALE;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(rupiah);
}

export function formatNumber(value: number | null | undefined, locale: Locale = "id"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatKg(value: number | null | undefined, locale: Locale = "id"): string {
  return value === null || value === undefined ? "—" : `${formatNumber(value, locale)} kg`;
}

export function formatArea(m2: number | null | undefined, locale: Locale = "id"): string {
  if (!m2) return "—";
  if (m2 >= 10_000) return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(m2 / 10_000)} ha`;
  return `${formatNumber(m2, locale)} m²`;
}

export function formatDateTime(ms: number | string | null | undefined, locale: Locale = "id"): string {
  if (ms === null || ms === undefined || ms === "") return "—";
  const date = new Date(typeof ms === "string" ? ms : Number(ms));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatDate(ms: number | string | null | undefined, locale: Locale = "id"): string {
  if (ms === null || ms === undefined || ms === "") return "—";
  const date = new Date(typeof ms === "string" ? ms : Number(ms));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(date);
}

/** "2026-12" → "Desember 2026". */
export function formatMonth(yyyyMm: string, locale: Locale = "id"): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 15)));
}

export function shortHash(hash: string | null | undefined, head = 6, tail = 4): string {
  if (!hash) return "—";
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** Long implicit / EVM-style account ids get shortened; named accounts stay readable. */
export function shortAccount(accountId: string | null | undefined): string {
  if (!accountId) return "—";
  if (/^[0-9a-f]{64}$/.test(accountId) || accountId.startsWith("0x")) return shortHash(accountId, 6, 4);
  return accountId.length > 28 ? `${accountId.slice(0, 18)}…${accountId.slice(-8)}` : accountId;
}

/** Settlement preview — the exact INTERFACES §3 math, in base units. */
export function settlementPreview(input: {
  actualKg: number;
  projectedKg: number;
  pricePerKg: string;
  escrow: string;
  feeBps: number;
}) {
  const delivered = BigInt(Math.max(0, Math.min(Math.floor(input.actualKg), input.projectedKg)));
  const price = toBig(input.pricePerKg);
  const gross = delivered * price;
  const fee = (gross * BigInt(input.feeBps)) / 10_000n;
  const escrow = toBig(input.escrow);
  return {
    deliveredKg: Number(delivered),
    gross: gross.toString(),
    farmer: (gross - fee).toString(),
    treasury: fee.toString(),
    holder: (escrow > gross ? escrow - gross : 0n).toString(),
  };
}
