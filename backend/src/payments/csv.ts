export const CSV_COLUMNS = [
  'date_utc',
  'lot_id',
  'crop',
  'type',
  'from_account',
  'to_account',
  'amount_pusdc',
  'status',
  'tx_hash',
  'explorer_url',
  'note',
] as const;

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string | null | undefined>;

/** RFC 4180 field quoting + spreadsheet formula-injection guard. */
export function csvField(value: string | null | undefined): string {
  let v = value ?? '';
  // A leading = + - @ (or tab/CR) makes Excel/Sheets evaluate the cell; amounts are never negative.
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** "2026-11-07 14:03:22" (UTC, no zone suffix: Excel parses it as a date). */
export function csvDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** UTF-8 BOM + header + rows, CRLF line endings (what Excel expects). */
export function toCsv(rows: CsvRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvField(row[c])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
