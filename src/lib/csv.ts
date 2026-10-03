/**
 * CSV export helper (spec §40).
 *
 * Also guards against CSV injection: a cell starting with = + - @ is
 * prefixed with a single quote so opening an exported report in Excel
 * cannot execute a formula supplied by a malicious "student name".
 */

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (DANGEROUS_PREFIX.test(text)) text = `'${text}`;
  if (/[",\n;]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return (columns ?? []).join(",");
  const headers = columns ?? Object.keys(rows[0] ?? {});
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
  }
  // BOM is added by the route so Excel renders Arabic correctly.
  return lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string): Response {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store"
    }
  });
}
