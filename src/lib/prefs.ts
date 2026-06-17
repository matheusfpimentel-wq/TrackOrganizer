import type { Lens } from "@/lib/analysis";

/** Persist small UI preferences in localStorage (best-effort). */

const COL_WIDTHS_KEY = "tracklistr.colWidths";
const VIEW_KEY = "tracklistr.view";
const TITLE_FORMAT_KEY = "tracklistr.titleFormat";
const DENSITY_KEY = "tracklistr.density";

export type Density = "compact" | "comfortable";

export function loadDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === "comfortable" ? "comfortable" : "compact";
  } catch {
    return "compact";
  }
}

export function saveDensity(d: Density): void {
  try {
    localStorage.setItem(DENSITY_KEY, d);
  } catch {
    // ignore
  }
}

export const DEFAULT_TITLE_FORMAT = "[titulo] - [artista] ([versao])";

export function loadTitleFormat(): string {
  try {
    return localStorage.getItem(TITLE_FORMAT_KEY) || DEFAULT_TITLE_FORMAT;
  } catch {
    return DEFAULT_TITLE_FORMAT;
  }
}

export function saveTitleFormat(fmt: string): void {
  try {
    localStorage.setItem(TITLE_FORMAT_KEY, fmt);
  } catch {
    // ignore
  }
}

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
