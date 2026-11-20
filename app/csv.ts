/**
 * Minimal RFC 4180 CSV writer.
 * - Quotes cells containing commas, quotes or line breaks and doubles inner quotes.
 * - Neutralises spreadsheet formula injection by prefixing risky leading characters.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows.map((row) => row.map(formatCell).join(',')).join('\r\n') + '\r\n';
}

function formatCell(raw: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
