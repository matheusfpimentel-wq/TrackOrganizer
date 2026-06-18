import { create } from "zustand";
import {
  AI_FIELDS,
  emptyTags,
  type AiField,
  type AiSuggestion,
  type Cue,
  type DeepScanResult,
  type DupGroup,
  type ScannedTrack,
  type StructureResult,
  type TagKey,
  type TrackRow,
  type TrackTags,
} from "@/types/track";
import { listen } from "@tauri-apps/api/event";
import * as api from "@/lib/api";
import type { ConfigPatch, PublicConfig } from "@/lib/api";
import { analyze, applyLens, type Analysis, type Lens } from "@/lib/analysis";
import { loadView, saveView, loadTitleFormat, saveTitleFormat } from "@/lib/prefs";
import { applyTemplate, applyCharLimit } from "@/lib/format";

const INITIAL_VIEW = loadView();

const NUMERIC_KEYS: ReadonlySet<TagKey> = new Set<TagKey>(["bpm", "year", "energy"]);
const AI_FIELD_SET: ReadonlySet<string> = new Set<string>(AI_FIELDS);
/** Tracks per AI request, to avoid token blowups (spec: ~20). */
const AI_CHUNK = 20;

/** Top-level UI mode. */
export type AppMode = "library" | "analysis" | "export";

let toastSeq = 0;

/** Transient notification shown in the corner (success / error / info). */
export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
  detail?: string;
}

interface LastWrite {
  backupPath: string;
  /** Pre-write tags, to restore the UI on undo. */
  snapshot: { filePath: string; tags: TrackTags }[];
}

interface LibraryState {
  folder: string | null;
  rows: TrackRow[];
  /** Undo/redo stacks of previous `rows` snapshots (structural sharing). */
  editPast: TrackRow[][];
  editFuture: TrackRow[][];
  scanning: boolean;
  scanProgress: { done: number; total: number } | null;
  globalError: string | null;
  filter: string;
  /** Active analysis lens (all / duplicates / no-genre / issues). */
  lens: Lens;
  /** Selected cells as `rowId::colKey`. */
  selection: Set<string>;
  /** Anchor for shift-range selection. */
  anchor: { rowId: string; colKey: TagKey } | null;

  config: PublicConfig;

  /** Active top-level mode (Library / Analysis / Export). */
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  aiRunning: boolean;
  aiProgress: { done: number; total: number } | null;
  aiError: string | null;
  reviewOpen: boolean;

  writing: boolean;
  /** Transient corner notifications. */
  toasts: Toast[];
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
  /** Detected cues per row id (exported as rekordbox POSITION_MARK). */
  cuesByRow: Record<string, Cue[]>;
  cueBatchRunning: boolean;
  cueBatchProgress: { done: number; total: number } | null;

  /** Cover-art data URLs by row id (lazy; null = none). */
  artwork: Record<string, string | null>;
  loadArtwork: (rowId: string) => Promise<void>;

  /** Row currently loaded in the player (null = nothing). */
  playingRowId: string | null;
  /** Seek request (secs) for the player to honor, then clear. */
  seekTo: number | null;
  playRow: (rowId: string) => void;
  requestSeek: (secs: number) => void;
  clearSeek: () => void;

  scan: (recursive: boolean) => Promise<void>;
  importLibrary: () => Promise<void>;
  setFilter: (value: string) => void;
  setLens: (lens: Lens) => void;
  setCell: (rowId: string, key: TagKey, raw: string) => void;
  /** Apply many cell writes (rowId+col+value) in a single undo step. */
  setCells: (updates: { rowId: string; key: TagKey; raw: string }[]) => void;
  clearCells: (keys: Iterable<string>) => void;
  resetRow: (rowId: string) => void;
  /** Configurable title naming template (e.g. "[titulo] - [artista] ([versao])"). */
  titleFormat: string;
  setTitleFormat: (fmt: string) => void;
  applyTitlePattern: () => void;
  findReplace: (col: TagKey, find: string, repl: string, selectionOnly: boolean, ci: boolean) => void;
  /** Rename the given rows' files on disk to match their (edited) Title. */
  renameToTitle: (rowIds: string[]) => Promise<void>;
  undoEdit: () => void;
  redoEdit: () => void;
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
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setWriteConfirmOpen: (open: boolean) => void;

  setSetlistOpen: (open: boolean) => void;
  addToSetlist: (rowIds: string[]) => void;
  removeFromSetlist: (index: number) => void;
  moveSetlistItem: (index: number, dir: -1 | 1) => void;
  reorderSetlist: (from: number, to: number) => void;
  setTransitionNote: (index: number, note: string) => void;
  clearSetlist: () => void;

  runDeepScan: () => Promise<void>;
  setDeepScanOpen: (open: boolean) => void;
  runAudioDuplicates: () => Promise<void>;
  setAudioDupOpen: (open: boolean) => void;
  detectCues: (rowId: string) => Promise<void>;
  detectCuesForSelection: () => Promise<void>;
  setCueOpen: (open: boolean) => void;
  writeSeratoCues: (rowId: string) => Promise<void>;
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

const HISTORY_LIMIT = 80;

/** Patch that snapshots the current rows onto the undo stack and clears redo. */
function historyPatch(state: { editPast: TrackRow[][]; rows: TrackRow[] }): {
  editPast: TrackRow[][];
  editFuture: TrackRow[][];
} {
  return {
    editPast: [...state.editPast, state.rows].slice(-HISTORY_LIMIT),
    editFuture: [],
  };
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
  editPast: [],
  editFuture: [],
  scanning: false,
  scanProgress: null,
  globalError: null,
  filter: INITIAL_VIEW.filter,
  lens: INITIAL_VIEW.lens,
  titleFormat: loadTitleFormat(),
  selection: new Set<string>(),
  anchor: null,

  config: {
    provider: "ollama",
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
  toasts: [],
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
  cuesByRow: {},
  cueBatchRunning: false,
  cueBatchProgress: null,
  artwork: {},
  playingRowId: null,
  seekTo: null,

  scan: async (recursive) => {
    set({ globalError: null });
    const folder = await api.pickFolder();
    if (!folder) {
      return;
    }
    set({
      scanning: true,
      folder,
      rows: [],
      selection: new Set<string>(),
      anchor: null,
      editPast: [],
      editFuture: [],
      artwork: {},
      scanProgress: { done: 0, total: 0 },
    });

    // Browser dev fallback: no streaming, just load the sample.
    if (!api.isTauri()) {
      try {
        const scanned = await api.scanFolder(folder, recursive);
        set({ rows: scanned.map(rowFromScan), scanning: false, scanProgress: null });
      } catch (err) {
        set({ scanning: false, scanProgress: null, globalError: String(err) });
      }
      return;
    }

    // Streaming + parallel scan: tracks arrive in batches via events.
    const unlistenBatch = await listen<ScannedTrack[]>("scan-batch", (e) => {
      const batch = e.payload.map(rowFromScan);
      set((state) => ({
        rows: [...state.rows, ...batch],
        scanProgress: {
          done: state.rows.length + batch.length,
          total: state.scanProgress?.total ?? 0,
        },
      }));
    });
    const unlistenDone = await listen("scan-done", () => {
      set({ scanning: false, scanProgress: null });
      unlistenBatch();
      unlistenDone();
    });

    try {
      const total = await api.scanFolderStream(folder, recursive);
      set((state) => ({ scanProgress: { done: state.rows.length, total } }));
      if (total === 0) {
        set({ scanning: false, scanProgress: null });
        unlistenBatch();
        unlistenDone();
      }
    } catch (err) {
      set({ scanning: false, scanProgress: null, globalError: String(err) });
      unlistenBatch();
      unlistenDone();
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
      set({ rows: scanned.map(rowFromScan), scanning: false, editPast: [], editFuture: [], artwork: {} });
    } catch (err) {
      set({ scanning: false, globalError: String(err) });
    }
  },

  mode: "library",
  setMode: (mode) => set({ mode }),

  setFilter: (value) => {
    set({ filter: value });
    saveView({ filter: value, lens: get().lens });
  },
  setLens: (lens) => {
    set((state) => ({ lens: state.lens === lens ? "all" : lens }));
    saveView({ filter: get().filter, lens: get().lens });
  },

  setCell: (rowId, key, raw) => {
    set((state) => ({
      ...historyPatch(state),
      rows: state.rows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const edited: TrackTags = { ...row.edited, [key]: coerce(key, raw) };
        return { ...row, edited, status: statusFor({ ...row, edited }) };
      }),
    }));
  },

  setCells: (updates) => {
    if (updates.length === 0) {
      return;
    }
    const byRow = new Map<string, { key: TagKey; raw: string }[]>();
    for (const u of updates) {
      const list = byRow.get(u.rowId) ?? [];
      list.push({ key: u.key, raw: u.raw });
      byRow.set(u.rowId, list);
    }
    set((state) => ({
      ...historyPatch(state),
      rows: state.rows.map((row) => {
        const ups = byRow.get(row.id);
        if (!ups) {
          return row;
        }
        let edited: TrackTags = { ...row.edited };
        for (const { key, raw } of ups) {
          edited = { ...edited, [key]: coerce(key, raw) };
        }
        return { ...row, edited, status: statusFor({ ...row, edited }) };
      }),
    }));
  },

  undoEdit: () => {
    set((state) => {
      const prev = state.editPast[state.editPast.length - 1];
      if (!prev) {
        return {};
      }
      return {
        rows: prev,
        editPast: state.editPast.slice(0, -1),
        editFuture: [state.rows, ...state.editFuture].slice(0, HISTORY_LIMIT),
      };
    });
  },

  redoEdit: () => {
    set((state) => {
      const next = state.editFuture[0];
      if (!next) {
        return {};
      }
      return {
        rows: next,
        editPast: [...state.editPast, state.rows].slice(-HISTORY_LIMIT),
        editFuture: state.editFuture.slice(1),
      };
    });
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
      ...historyPatch(state),
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
      ...historyPatch(state),
      rows: state.rows.map((row) =>
        row.id === rowId
          ? { ...row, edited: { ...row.original }, suggested: null, status: row.error ? "error" : "pristine" }
          : row,
      ),
    }));
  },

  setTitleFormat: (fmt) => {
    set({ titleFormat: fmt });
    saveTitleFormat(fmt);
  },

  applyTitlePattern: () => {
    set((state) => {
      const ids = new Set<string>();
      for (const key of state.selection) {
        const sep = key.indexOf("::");
        if (sep > 0) ids.add(key.slice(0, sep));
      }
      const inScope = (r: TrackRow) => (ids.size > 0 ? ids.has(r.id) : true);
      const rows = state.rows.map((row) => {
        if (!inScope(row) || row.error) return row;
        const title = applyCharLimit(applyTemplate(state.titleFormat, row.edited, row.fileName), state.config.charLimit);
        if (title === row.edited.title || title === "") return row;
        const edited: TrackTags = { ...row.edited, title };
        return { ...row, edited, status: statusFor({ ...row, edited }) };
      });
      return { ...historyPatch(state), rows };
    });
  },

  findReplace: (col, find, repl, selectionOnly, ci) => {
    if (find === "") return;
    set((state) => {
      const ids = new Set<string>();
      for (const key of state.selection) {
        const sep = key.indexOf("::");
        if (sep > 0) ids.add(key.slice(0, sep));
      }
      const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ci ? "gi" : "g");
      const rows = state.rows.map((row) => {
        if (selectionOnly && !ids.has(row.id)) return row;
        if (row.error) return row;
        const cur = row.edited[col];
        if (typeof cur !== "string") return row;
        const next = cur.replace(re, repl);
        if (next === cur) return row;
        const edited: TrackTags = { ...row.edited, [col]: next };
        return { ...row, edited, status: statusFor({ ...row, edited }) };
      });
      return { ...historyPatch(state), rows };
    });
  },

  renameToTitle: async (rowIds) => {
    const ids = new Set(rowIds);
    const targets = get().rows.filter((r) => ids.has(r.id) && !r.error && r.edited.title.trim());
    if (targets.length === 0) {
      set({ globalError: "Selecione faixas com título para renomear." });
      return;
    }
    set({ writing: true, globalError: null });
    let ok = 0;
    let failed = 0;
    for (const row of targets) {
      try {
        const newPath = await api.renameFile(row.filePath, row.edited.title);
        const slash = Math.max(newPath.lastIndexOf("/"), newPath.lastIndexOf("\\"));
        const fileName = slash >= 0 ? newPath.slice(slash + 1) : newPath;
        set((state) => ({
          rows: state.rows.map((r) => (r.id === row.id ? { ...r, filePath: newPath, fileName } : r)),
        }));
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    set({ writing: false });
    get().pushToast({
      kind: failed > 0 ? "error" : "success",
      message: `Renomeado: ${ok} ok${failed > 0 ? `, ${failed} falhou` : ""}`,
    });
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
      ...historyPatch(state),
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
      ...historyPatch(state),
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
      ...historyPatch(state),
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
      ...historyPatch(state),
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
    set({ writing: true, globalError: null });
    try {
      const outcome = await api.writeTags(
        dirty.map((r) => ({ filePath: r.filePath, tags: r.edited })),
      );
      const okPaths = new Set(outcome.results.filter((x) => x.ok).map((x) => x.filePath));
      const okCount = outcome.results.filter((x) => x.ok).length;
      const failedCount = outcome.results.filter((x) => !x.ok).length;
      set((state) => ({
        writing: false,
        rows: state.rows.map((row) =>
          okPaths.has(row.filePath)
            ? { ...row, original: { ...row.edited }, status: "pristine" }
            : row,
        ),
        lastWrite: { backupPath: outcome.backupPath, snapshot },
      }));
      get().pushToast({
        kind: failedCount > 0 ? "error" : "success",
        message: `Gravado: ${okCount} ok${failedCount > 0 ? `, ${failedCount} falhou` : ""}`,
        detail: `backup: ${outcome.backupPath}`,
      });
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
      }));
      get().pushToast({
        kind: "success",
        message: `Desfeito: ${last.snapshot.length} faixa(s) restaurada(s)`,
      });
    } catch (err) {
      set({ writing: false, globalError: String(err) });
    }
  },

  pushToast: (toast) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
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

  reorderSetlist: (from, to) => {
    set((state) => {
      if (from === to || from < 0 || to < 0) {
        return {};
      }
      const next = [...state.setlist];
      const moved = next[from];
      if (!moved || to >= next.length) {
        return {};
      }
      next.splice(from, 1);
      next.splice(to, 0, moved);
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
      set((state) => ({
        structure,
        structureLoading: false,
        cuesByRow: { ...state.cuesByRow, [rowId]: structure.cues },
      }));
    } catch (err) {
      set({ structureLoading: false, globalError: String(err) });
    }
  },

  detectCuesForSelection: async () => {
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
      set({ globalError: "Selecione faixas para detectar cues." });
      return;
    }
    set({ cueBatchRunning: true, cueBatchProgress: { done: 0, total: targets.length }, globalError: null });
    let done = 0;
    for (const row of targets) {
      try {
        const structure = await api.detectCues(row.filePath);
        set((state) => ({ cuesByRow: { ...state.cuesByRow, [row.id]: structure.cues } }));
      } catch {
        // skip failures, keep going
      }
      done += 1;
      set({ cueBatchProgress: { done, total: targets.length } });
    }
    set({ cueBatchRunning: false, cueBatchProgress: null });
  },

  setCueOpen: (open) => set({ cueOpen: open }),

  loadArtwork: async (rowId) => {
    const row = get().rows.find((r) => r.id === rowId);
    if (!row || row.id in get().artwork) {
      return;
    }
    // Mark as in-flight (null) so it isn't requested twice.
    set((state) => ({ artwork: { ...state.artwork, [rowId]: null } }));
    try {
      const url = await api.getArtwork(row.filePath);
      set((state) => ({ artwork: { ...state.artwork, [rowId]: url } }));
    } catch {
      // keep null
    }
  },

  playRow: (rowId) => set({ playingRowId: rowId }),
  requestSeek: (secs) => set({ seekTo: secs }),
  clearSeek: () => set({ seekTo: null }),

  writeSeratoCues: async (rowId) => {
    const { rows, cuesByRow } = get();
    const row = rows.find((r) => r.id === rowId);
    if (!row) {
      return;
    }
    set({ writing: true, globalError: null });
    try {
      let cues = cuesByRow[rowId];
      if (!cues) {
        const structure = await api.detectCues(row.filePath);
        cues = structure.cues;
        set((state) => ({ cuesByRow: { ...state.cuesByRow, [rowId]: structure.cues } }));
      }
      const backupPath = await api.writeSeratoCues(row.filePath, cues);
      set({ writing: false });
      get().pushToast({ kind: "success", message: "Cues gravados no Serato", detail: `backup: ${backupPath}` });
    } catch (err) {
      set({ writing: false, globalError: String(err) });
    }
  },
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
