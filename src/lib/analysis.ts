import type { TrackRow } from "@/types/track";

export type Lens = "all" | "duplicates" | "no-genre" | "issues";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Key used to group likely-duplicate tracks (title + artist, or filename). */
function dupKey(row: TrackRow): string {
  const t = row.edited;
  const base = `${norm(t.title)}|${norm(t.artist)}`;
  return base === "|" ? norm(row.fileName) : base;
}

/** Ids of rows that share a title+artist (or filename) with another row. */
export function findDuplicateIds(rows: TrackRow[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = dupKey(row);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(row.id);
  }
  const dups = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length > 1) {
      for (const id of ids) {
        dups.add(id);
      }
    }
  }
  return dups;
}

const CURRENT_YEAR = new Date().getFullYear();

/** Per-row list of consistency problems (empty when the row looks fine). */
export function rowIssues(row: TrackRow): string[] {
  if (row.status === "error") {
    return ["arquivo ilegível"];
  }
  const t = row.edited;
  const issues: string[] = [];
  if (!t.title.trim()) {
    issues.push("sem título");
  }
  if (!t.artist.trim()) {
    issues.push("sem artista");
  }
  if (!t.genre.trim()) {
    issues.push("sem gênero");
  }
  if (t.bpm !== null && (t.bpm < 40 || t.bpm > 220)) {
    issues.push(`BPM improvável (${t.bpm})`);
  }
  if (t.year !== null && (t.year < 1900 || t.year > CURRENT_YEAR + 1)) {
    issues.push(`ano improvável (${t.year})`);
  }
  if (t.energy !== null && (t.energy < 1 || t.energy > 5)) {
    issues.push(`energia fora de 1–5 (${t.energy})`);
  }
  return issues;
}

export interface Analysis {
  duplicates: Set<string>;
  noGenre: Set<string>;
  issues: Map<string, string[]>;
}

export function analyze(rows: TrackRow[]): Analysis {
  const duplicates = findDuplicateIds(rows);
  const noGenre = new Set<string>();
  const issues = new Map<string, string[]>();
  for (const row of rows) {
    if (row.status !== "error" && !row.edited.genre.trim()) {
      noGenre.add(row.id);
    }
    const found = rowIssues(row);
    if (found.length > 0) {
      issues.set(row.id, found);
    }
  }
  return { duplicates, noGenre, issues };
}

/** Restrict rows to the active lens. */
export function applyLens(rows: TrackRow[], lens: Lens, analysis: Analysis): TrackRow[] {
  switch (lens) {
    case "duplicates":
      return rows.filter((r) => analysis.duplicates.has(r.id));
    case "no-genre":
      return rows.filter((r) => analysis.noGenre.has(r.id));
    case "issues":
      return rows.filter((r) => analysis.issues.has(r.id));
    default:
      return rows;
  }
}
