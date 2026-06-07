import { create } from "zustand";
import {
  AI_FIELDS,
  emptyTags,
  type AiField,
  type AiSuggestion,
  type DeepScanResult,
  type DupGroup,
  type ScannedTrack,
  type StructureResult,
  type TagKey,
  type TrackRow,
  type TrackTags,
} from "@/types/track";
import * as api from "@/lib/api";
import type { ConfigPatch, PublicConfig } from "@/lib/api";
import { analyze, applyLens, type Analysis, type Lens } from "@/lib/analysis";

const NUMERIC_KEYS: ReadonlySet<TagKey> = new Set<TagKey>(["bpm", "year", "energy"]);
const AI_FIELD_SET: ReadonlySet<string> = new Set<string>(AI_FIELDS);
/** Tracks per AI request, to avoid token blowups (spec: ~20). */
const AI_CHUNK = 20;

interface WriteSummary {
  ok: number;
  failed: number;
  backupPath: string;
}

interface LastWrite {
  backupPath: string;
  /** Pre-write tags, to restore the UI on undo. */
  snapshot: { filePath: string; tags: TrackTags }[];
}

interface LibraryState {
  folder: string | null;
  rows: TrackRow[];
  scanning: boolean;
  globalError: string | null;
  filter: string;
  /** Active analysis lens (all / duplicates / no-genre / issues). */
  lens: Lens;
  /** Selected cells as `rowId::colKey`. */
  selection: Set<string>;
  /** Anchor for shift-range selection. */
  anchor: { rowId: string; colKey: TagKey } | null;

  config: PublicConfig;

  aiRunning: boolean;
  aiProgress: { done: number; total: number } | null;
  aiError: string | null;
  reviewOpen: boolean;

  writing: boolean;
  writeResult: WriteSummary | null;
  lastWrite: LastWrite | null;
  writeConfirmOpen: boolean;

  /** Ordered setlist (row id + transition note to the next track). */
  setlist: { rowId: string; note: string }[];
  setlistOpen: boolean;

  /** Deep-scan results keyed by row id. */
  deepScan: Record<string, DeepScanResult>;
  deepScanRunning: boolean;
  deepScanProgress: { done: number; total: number } | null;
  deepScanOpen: boolean;

  /** Audio-fingerprint duplicate groups (file paths). */
  audioDups: DupGroup[];
  audioDupRunning: boolean;
  audioDupOpen: boolean;

  /** Structure / cue detection for the currently inspected track. */
  structure: StructureResult | null;
  structureName: string;
  structureLoading: boolean;
  cueOpen: boolean;

  scan: () => Promise<void>;
  importLibrary: () => Promise<void>;
  setFilter: (value: string) => void;
  setLens: (lens: Lens) => void;
  setCell: (rowId: string, key: TagKey, raw: string) => void;
  clearCells: (keys: Iterable<string>) => void;
  resetRow: (rowId: string) => void;
  setSelection: (keys: Set<string>) => void;
  setAnchor: (anchor: { rowId: string; colKey: TagKey } | null) => void;
  clearSelection: () => void;

  loadConfig: () => Promise<void>;
  saveConfig: (patch: ConfigPatch) => Promise<void>;
  clearApiKey: () => Promise<void>;

  runAi: () => Promise<void>;
  applySuggestion: (rowId: string, field: AiField) => void;
  rejectSuggestion: (rowId: string, field: AiField) => void;
  applyAllSuggestions: () => void;
  rejectAllSuggestions: () => void;
  setReviewOpen: (open: boolean) => void;
  setAiError: (msg: string | null) => void;

  writeApproved: () => Promise<void>;
  undoLastWrite: () => Promise<void>;
  clearWriteResult: () => void;
  setWriteConfirmOpen: (open: boolean) => void;

  setSetlistOpen: (open: boolean) => void;
  addToSetlist: (rowIds: string[]) => void;
  removeFromSetlist: (index: number) => void;
  moveSetlistItem: (index: number, dir: -1 | 1) => void;
  setTransitionNote: (index: number, note: string) => void;
  clearSetlist: () => void;

  runDeepScan: () => Promise<void>;
  setDeepScanOpen: (open: boolean) => void;
  runAudioDuplicates: () => Promise<void>;
  setAudioDupOpen: (open: boolean) => void;
  detectCues: (rowId: string) => Promise<void>;
  setCueOpen: (open: boolean) => void;
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
    durationSecs: t.durationSecs,
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Map the selection to AI-capable fields per row + the union of fields. */
function buildAiTargets(selection: Set<string>): {
  perRow: Map<string, Set<AiField>>;
  fields: AiField[];
} {
  const perRow = new Map<string, Set<AiField>>();
  const fields = new Set<AiField>();
  for (const key of selection) {
    const sep = key.indexOf("::");
    if (sep < 0) {
      continue;
    }
    const colKey = key.slice(sep + 2);
    if (!AI_FIELD_SET.has(colKey)) {
      continue;
    }
    const field = colKey as AiField;
    const rowId = key.slice(0, sep);
    const set = perRow.get(rowId) ?? new Set<AiField>();
    set.add(field);
    perRow.set(rowId, set);
    fields.add(field);
  }
  return { perRow, fields: [...fields] };
}

function toAiInput(row: TrackRow): api.AiTrackInput {
  const t = row.edited;
  return {
    id: row.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    genre: t.genre,
    comment: t.comment,
    bpm: t.bpm,
    key: t.key,
    year: t.year,
    fileName: row.fileName,
  };
}

/** Keep only suggested fields the user targeted and that actually differ. */
function buildSuggestedPartial(
  sug: AiSuggestion,
  wanted: Set<AiField>,
  edited: TrackTags,
): Partial<TrackTags> {
  let out: Partial<TrackTags> = {};
  for (const field of wanted) {
    const value = sug[field];
    if (value === undefined || value === null) {
      continue;
    }
    if (edited[field] === value) {
      continue;
    }
    out = { ...out, [field]: value };
  }
  return out;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  folder: null,
  rows: [],
  scanning: false,
  globalError: null,
  filter: "",
  lens: "all",
  selection: new Set<string>(),
  anchor: null,

  config: {
    provider: "claude",
    model: "claude-sonnet-4-6",
    charLimit: 50,
    hasApiKey: false,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "llama3.1",
    genres: [],
    genreStrict: false,
  },

  aiRunning: false,
  aiProgress: null,
  aiError: null,
  reviewOpen: false,

  writing: false,
  writeResult: null,
  lastWrite: null,
  writeConfirmOpen: false,

  setlist: [],
  setlistOpen: false,

  deepScan: {},
  deepScanRunning: false,
  deepScanProgress: null,
  deepScanOpen: false,

  audioDups: [],
  audioDupRunning: false,
  audioDupOpen: false,

  structure: null,
  structureName: "",
  structureLoading: false,
  cueOpen: false,

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

  importLibrary: async () => {
    set({ globalError: null });
    const path = await api.pickFile([
      { name: "Coleção / Playlist", extensions: ["xml", "m3u8", "m3u"] },
    ]);
    if (!path) {
      return;
    }
    set({ scanning: true, folder: path, selection: new Set<string>(), anchor: null });
    try {
      const lower = path.toLowerCase();
      const scanned = lower.endsWith(".xml")
        ? await api.importRekordboxXml(path)
        : await api.importM3u(path);
      set({ rows: scanned.map(rowFromScan), scanning: false });
    } catch (err) {
      set({ scanning: false, globalError: String(err) });
    }
  },

  setFilter: (value) => set({ filter: value }),
  setLens: (lens) => set((state) => ({ lens: state.lens === lens ? "all" : lens })),

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

  loadConfig: async () => {
    try {
      const config = await api.getConfig();
      set({ config });
    } catch (err) {
      set({ globalError: String(err) });
    }
  },

  saveConfig: async (patch) => {
    const config = await api.updateConfig(patch);
    set({ config });
  },

  clearApiKey: async () => {
    const config = await api.clearApiKey();
    set({ config });
  },

  runAi: async () => {
    const { rows, selection, config } = get();
    const { perRow, fields } = buildAiTargets(selection);
    if (fields.length === 0 || perRow.size === 0) {
      set({ aiError: "Selecione células de Título, Artista, Gênero ou Energia." });
      return;
    }
    if (config.provider === "claude" && !config.hasApiKey) {
      set({ aiError: "Configure a API key do Claude (engrenagem) antes de taggear." });
      return;
    }
    const targetRows = rows.filter((r) => perRow.has(r.id) && !r.error);
    if (targetRows.length === 0) {
      set({ aiError: "Nenhuma faixa válida selecionada." });
      return;
    }

    set({ aiRunning: true, aiError: null, aiProgress: { done: 0, total: targetRows.length } });
    try {
      const byId = new Map<string, AiSuggestion>();
      let done = 0;
      for (const part of chunk(targetRows, AI_CHUNK)) {
        const res = await api.tagWithAi({
          tracks: part.map(toAiInput),
          fields,
          charLimit: config.charLimit,
        });
        for (const s of res.suggestions) {
          byId.set(s.id, s);
        }
        done += part.length;
        set({ aiProgress: { done, total: targetRows.length } });
      }

      set((state) => ({
        rows: state.rows.map((row) => {
          const sug = byId.get(row.id);
          const wanted = perRow.get(row.id);
          if (!sug || !wanted) {
            return row;
          }
          const suggested = buildSuggestedPartial(sug, wanted, row.edited);
          if (Object.keys(suggested).length === 0) {
            return row;
          }
          return { ...row, suggested, status: "pending_approval" };
        }),
        aiRunning: false,
        aiProgress: null,
        reviewOpen: true,
      }));
    } catch (err) {
      set({ aiRunning: false, aiProgress: null, aiError: String(err) });
    }
  },

  applySuggestion: (rowId, field) => {
    set((state) => ({
      rows: state.rows.map((row) => {
        if (row.id !== rowId || !row.suggested) {
          return row;
        }
        const value = row.suggested[field];
        if (value === undefined) {
          return row;
        }
        const edited: TrackTags = { ...row.edited, [field]: value };
        const rest = { ...row.suggested };
        delete rest[field];
        const suggested = Object.keys(rest).length > 0 ? rest : null;
        return {
          ...row,
          edited,
          suggested,
          status: suggested ? "pending_approval" : statusFor({ ...row, edited }),
        };
      }),
    }));
  },

  rejectSuggestion: (rowId, field) => {
    set((state) => ({
      rows: state.rows.map((row) => {
        if (row.id !== rowId || !row.suggested) {
          return row;
        }
        const rest = { ...row.suggested };
        delete rest[field];
        const suggested = Object.keys(rest).length > 0 ? rest : null;
        return { ...row, suggested, status: suggested ? "pending_approval" : statusFor(row) };
      }),
    }));
  },

  applyAllSuggestions: () => {
    set((state) => ({
      reviewOpen: false,
      rows: state.rows.map((row) => {
        if (!row.suggested) {
          return row;
        }
        let edited: TrackTags = { ...row.edited };
        for (const field of AI_FIELDS) {
          const value = row.suggested[field];
          if (value !== undefined) {
            edited = { ...edited, [field]: value };
          }
        }
        return { ...row, edited, suggested: null, status: statusFor({ ...row, edited }) };
      }),
    }));
  },

  rejectAllSuggestions: () => {
    set((state) => ({
      reviewOpen: false,
      rows: state.rows.map((row) =>
        row.suggested ? { ...row, suggested: null, status: statusFor(row) } : row,
      ),
    }));
  },

  setReviewOpen: (open) => set({ reviewOpen: open }),
  setAiError: (msg) => set({ aiError: msg }),

  writeApproved: async () => {
    const dirty = get().rows.filter((r) => r.status === "ready_to_write");
    if (dirty.length === 0) {
      return;
    }
    // Pre-write tags (== current originals) let us restore the UI on undo.
    const snapshot = dirty.map((r) => ({ filePath: r.filePath, tags: { ...r.original } }));
    set({ writing: true, globalError: null, writeResult: null });
    try {
      const outcome = await api.writeTags(
        dirty.map((r) => ({ filePath: r.filePath, tags: r.edited })),
      );
      const okPaths = new Set(outcome.results.filter((x) => x.ok).map((x) => x.filePath));
      set((state) => ({
        writing: false,
        rows: state.rows.map((row) =>
          okPaths.has(row.filePath)
            ? { ...row, original: { ...row.edited }, status: "pristine" }
            : row,
        ),
        writeResult: {
          ok: outcome.results.filter((x) => x.ok).length,
          failed: outcome.results.filter((x) => !x.ok).length,
          backupPath: outcome.backupPath,
        },
        lastWrite: { backupPath: outcome.backupPath, snapshot },
      }));
    } catch (err) {
      set({ writing: false, globalError: String(err) });
    }
  },

  undoLastWrite: async () => {
    const last = get().lastWrite;
    if (!last) {
      return;
    }
    set({ writing: true, globalError: null });
    try {
      await api.undoWrite(last.backupPath);
      const restored = new Map(last.snapshot.map((s) => [s.filePath, s.tags]));
      set((state) => ({
        writing: false,
        lastWrite: null,
        rows: state.rows.map((row) => {
          const tags = restored.get(row.filePath);
          if (!tags) {
            return row;
          }
          return { ...row, original: { ...tags }, edited: { ...tags }, suggested: null, status: "pristine" };
        }),
        writeResult: { ok: last.snapshot.length, failed: 0, backupPath: last.backupPath },
      }));
    } catch (err) {
      set({ writing: false, globalError: String(err) });
    }
  },

  clearWriteResult: () => set({ writeResult: null }),
  setWriteConfirmOpen: (open) => set({ writeConfirmOpen: open }),

  setSetlistOpen: (open) => set({ setlistOpen: open }),

  addToSetlist: (rowIds) => {
    set((state) => {
      const present = new Set(state.setlist.map((s) => s.rowId));
      const additions = rowIds
        .filter((id) => !present.has(id))
        .map((rowId) => ({ rowId, note: "" }));
      return { setlist: [...state.setlist, ...additions], setlistOpen: true };
    });
  },

  removeFromSetlist: (index) => {
    set((state) => ({ setlist: state.setlist.filter((_, i) => i !== index) }));
  },

  moveSetlistItem: (index, dir) => {
    set((state) => {
      const next = [...state.setlist];
      const target = index + dir;
      if (target < 0 || target >= next.length) {
        return {};
      }
      const a = next[index];
      const b = next[target];
      if (!a || !b) {
        return {};
      }
      next[index] = b;
      next[target] = a;
      return { setlist: next };
    });
  },

  setTransitionNote: (index, note) => {
    set((state) => ({
      setlist: state.setlist.map((item, i) => (i === index ? { ...item, note } : item)),
    }));
  },

  clearSetlist: () => set({ setlist: [] }),

  runDeepScan: async () => {
    const { rows, selection } = get();
    const ids = new Set<string>();
    for (const key of selection) {
      const sep = key.indexOf("::");
      if (sep > 0) {
        ids.add(key.slice(0, sep));
      }
    }
    const targets = rows.filter((r) => ids.has(r.id) && !r.error);
    if (targets.length === 0) {
      set({ globalError: "Selecione faixas para o Deep Scan." });
      return;
    }
    set({ deepScanRunning: true, deepScanProgress: { done: 0, total: targets.length }, globalError: null });
    let done = 0;
    for (const row of targets) {
      try {
        const result = await api.deepScan(row.filePath);
        set((state) => ({ deepScan: { ...state.deepScan, [row.id]: result } }));
      } catch (err) {
        set({ globalError: `Deep Scan falhou em ${row.fileName}: ${String(err)}` });
      }
      done += 1;
      set({ deepScanProgress: { done, total: targets.length } });
    }
    set({ deepScanRunning: false, deepScanProgress: null, deepScanOpen: true });
  },

  setDeepScanOpen: (open) => set({ deepScanOpen: open }),

  runAudioDuplicates: async () => {
    const { rows, selection } = get();
    const ids = new Set<string>();
    for (const key of selection) {
      const sep = key.indexOf("::");
      if (sep > 0) {
        ids.add(key.slice(0, sep));
      }
    }
    // Use the selection if any, otherwise the whole library.
    const targets = (ids.size > 0 ? rows.filter((r) => ids.has(r.id)) : rows).filter((r) => !r.error);
    if (targets.length < 2) {
      set({ globalError: "Selecione ao menos 2 faixas (ou escaneie a biblioteca) para comparar." });
      return;
    }
    set({ audioDupRunning: true, globalError: null });
    try {
      const groups = await api.findAudioDuplicates(targets.map((r) => r.filePath));
      set({ audioDups: groups, audioDupRunning: false, audioDupOpen: true });
    } catch (err) {
      set({ audioDupRunning: false, globalError: String(err) });
    }
  },

  setAudioDupOpen: (open) => set({ audioDupOpen: open }),

  detectCues: async (rowId) => {
    const row = get().rows.find((r) => r.id === rowId);
    if (!row || row.error) {
      return;
    }
    set({ cueOpen: true, structureLoading: true, structure: null, structureName: row.fileName });
    try {
      const structure = await api.detectCues(row.filePath);
      set({ structure, structureLoading: false });
    } catch (err) {
      set({ structureLoading: false, globalError: String(err) });
    }
  },

  setCueOpen: (open) => set({ cueOpen: open }),
}));

/**
 * Visible rows = text filter + analysis lens. Analysis runs over the FULL
 * library (so duplicates are detected across everything), then the lens and
 * text filter narrow the view.
 */
export function selectVisible(
  rows: TrackRow[],
  filter: string,
  lens: Lens,
  analysis: Analysis,
): TrackRow[] {
  return applyLens(filterRows(rows, filter), lens, analysis);
}

export { analyze };

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
