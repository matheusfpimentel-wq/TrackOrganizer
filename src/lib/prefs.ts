import type { Lens } from "@/lib/analysis";

/** Persist small UI preferences in localStorage (best-effort). */

const COL_WIDTHS_KEY = "tracklistr.colWidths";
const VIEW_KEY = "tracklistr.view";

export interface ViewPrefs {
  filter: string;
  lens: Lens;
}

export function loadView(): ViewPrefs {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<ViewPrefs>;
      return { filter: v.filter ?? "", lens: v.lens ?? "all" };
    }
  } catch {
    // ignore
  }
  return { filter: "", lens: "all" };
}

export function saveView(view: ViewPrefs): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // ignore
  }
}

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
