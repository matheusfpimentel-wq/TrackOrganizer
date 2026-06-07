/** Persist small UI preferences in localStorage (best-effort). */

const COL_WIDTHS_KEY = "tracklistr.colWidths";

export function loadColWidths(defaults: Record<string, number>): Record<string, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_KEY);
    if (raw) {
      return { ...defaults, ...(JSON.parse(raw) as Record<string, number>) };
    }
  } catch {
    // ignore corrupt/unavailable storage
  }
  return defaults;
}

export function saveColWidths(widths: Record<string, number>): void {
  try {
    localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(widths));
  } catch {
    // ignore
  }
}
