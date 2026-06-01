import { create } from "zustand";
import {
  emptyTags,
  type ScannedTrack,
  type TagKey,
  type TrackRow,
  type TrackTags,
} from "@/types/track";
import * as api from "@/lib/api";

const NUMERIC_KEYS: ReadonlySet<TagKey> = new Set<TagKey>(["bpm", "year", "energy"]);

export interface Settings {
  /** Rekordbox-safe title length. */
  charLimit: number;
  /** Canonical title template (documented; applied by the curation engine). */
  titleFormat: string;
  /** Claude model id used once AI is wired. */
  model: string;
}

interface LastWrite {
  /** Previous on-disk tags, for "undo last write". */
  snapshot: { filePath: string; tags: TrackTags }[];
  backupPath: string;
}

interface LibraryState {
  folder: string | null;
  rows: TrackRow[];
  scanning: boolean;
  writing: boolean;
  globalError: string | null;
  filter: string;
  /** Selected cells as `rowId::colKey`. */
  selection: Set<string>;
  /** Anchor for shift-range selection. */
  anchor: { rowId: string; colKey: TagKey } | null;
  settings: Settings;
  lastWrite: LastWrite | null;

  scan: () => Promise<void>;
  setFilter: (value: string) => void;
  setCell: (rowId: string, key: TagKey, raw: string) => void;
  clearCells: (keys: Iterable<string>) => void;
  resetRow: (rowId: string) => void;
  setSelection: (keys: Set<string>) => void;
  setAnchor: (anchor: { rowId: string; colKey: TagKey } | null) => void;
  clearSelection: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

function tagsEqual(a: TrackTags, b: TrackTags): boolean {
  return (
    a.title === b.title &&
    a.artist === b.artist &&
    a.album === b.album &&
    a.genre === b.genre &&
    a.bpm === b.bpm &&
    a.key === b.key &&
    a.year === b.year &&
    a.energy === b.energy &&
    a.comment === b.comment
  );
}

function statusFor(row: Pick<TrackRow, "original" | "edited" | "error">): TrackRow["status"] {
  if (row.error) {
    return "error";
  }
  return tagsEqual(row.original, row.edited) ? "pristine" : "ready_to_write";
}

function rowFromScan(t: ScannedTrack): TrackRow {
  const tags = t.error ? emptyTags() : t.tags;
  return {
    id: t.id,
    filePath: t.filePath,
    fileName: t.fileName,
    format: t.format,
    hasArtwork: t.hasArtwork,
    original: tags,
    edited: { ...tags },
    suggested: null,
    status: t.error ? "error" : "pristine",
    error: t.error,
  };
}

function coerce(key: TagKey, raw: string): TrackTags[TagKey] {
  if (NUMERIC_KEYS.has(key)) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return null;
    }
    const n = Number.parseInt(trimmed, 10);
    return Number.isNaN(n) ? null : n;
  }
  return raw;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  folder: null,
  rows: [],
  scanning: false,
  writing: false,
  globalError: null,
  filter: "",
  selection: new Set<string>(),
  anchor: null,
  settings: {
    charLimit: 50,
    titleFormat: "Título - Artista (Versão)",
    model: "claude-sonnet-4-6",
  },
  lastWrite: null,

  scan: async () => {
    set({ globalError: null });
    const folder = await api.pickFolder();
    if (!folder) {
      return;
    }
    set({ scanning: true, folder, selection: new Set<string>(), anchor: null });
    try {
      const scanned = await api.scanFolder(folder);
      set({ rows: scanned.map(rowFromScan), scanning: false });
    } catch (err) {
      set({ scanning: false, globalError: String(err) });
    }
  },

  setFilter: (value) => set({ filter: value }),

  setCell: (rowId, key, raw) => {
    set((state) => ({
      rows: state.rows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const edited: TrackTags = { ...row.edited, [key]: coerce(key, raw) };
        return { ...row, edited, status: statusFor({ ...row, edited }) };
      }),
    }));
  },

  clearCells: (keys) => {
    const targets = new Map<string, Set<TagKey>>();
    for (const k of keys) {
      const sep = k.indexOf("::");
      if (sep < 0) {
        continue;
      }
      const rowId = k.slice(0, sep);
      const colKey = k.slice(sep + 2) as TagKey;
      const existing = targets.get(rowId) ?? new Set<TagKey>();
      existing.add(colKey);
      targets.set(rowId, existing);
    }
    set((state) => ({
      rows: state.rows.map((row) => {
        const cols = targets.get(row.id);
        if (!cols) {
          return row;
        }
        let edited: TrackTags = { ...row.edited };
        for (const colKey of cols) {
          edited = { ...edited, [colKey]: NUMERIC_KEYS.has(colKey) ? null : "" };
        }
        return { ...row, edited, status: statusFor({ ...row, edited }) };
      }),
    }));
  },

  resetRow: (rowId) => {
    set((state) => ({
      rows: state.rows.map((row) =>
        row.id === rowId
          ? { ...row, edited: { ...row.original }, suggested: null, status: row.error ? "error" : "pristine" }
          : row,
      ),
    }));
  },

  setSelection: (keys) => set({ selection: keys }),
  setAnchor: (anchor) => set({ anchor }),
  clearSelection: () => set({ selection: new Set<string>(), anchor: null }),
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
}));

/** Selector: rows passing the current text filter. */
export function filterRows(rows: TrackRow[], filter: string): TrackRow[] {
  const q = filter.trim().toLowerCase();
  if (!q) {
    return rows;
  }
  return rows.filter((row) => {
    const t = row.edited;
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q) ||
      row.fileName.toLowerCase().includes(q)
    );
  });
}

export { tagsEqual };
