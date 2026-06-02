import { COLUMNS, type TrackRow } from "@/types/track";
import { displayValue } from "@/lib/format";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Export the (edited) view of the given rows as CSV text. */
export function rowsToCsv(rows: TrackRow[]): string {
  const headers = [...COLUMNS.map((c) => c.label), "Arquivo"];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    const cells = COLUMNS.map((c) => displayValue(row.edited[c.key]));
    cells.push(row.fileName);
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\n");
}

/** Export a human-friendly tracklist as plain text (`Título - Artista`). */
export function rowsToTxt(rows: TrackRow[]): string {
  return rows
    .map((row) => {
      const { title, artist } = row.edited;
      const base = artist ? `${title} - ${artist}` : title;
      return base || row.fileName;
    })
    .join("\n");
}

/** Trigger a browser download of a text blob. */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
