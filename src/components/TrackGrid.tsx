import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { windowRange } from "@/lib/virtual";
import {
  loadColWidths,
  saveColWidths,
  loadDensity,
  saveDensity,
  loadSavedViews,
  saveSavedViews,
  type Density,
  type SavedView,
} from "@/lib/prefs";

const DEFAULT_WIDTHS: Record<string, number> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.width]),
);
import { COLUMNS, type ColumnDef, type TagKey, type TrackRow } from "@/types/track";
import { camelotColor, displayValue, formatDuration } from "@/lib/format";
import { cellKey, cn } from "@/lib/utils";
import { revealInFiles } from "@/lib/api";
import { analyze, selectVisible, useLibraryStore } from "@/store/useLibraryStore";

interface EditingCell {
  rowId: string;
  colKey: TagKey;
}

interface ContextMenu {
  x: number;
  y: number;
  row: TrackRow;
}

type SortKey = TagKey | "duration" | "fileName";

type GridItem =
  | { type: "row"; row: TrackRow; seq: number }
  | { type: "header"; gkey: string; label: string; count: number; collapsed: boolean };

const STATUS_COLOR: Record<TrackRow["status"], string> = {
  pristine: "bg-transparent",
  pending_approval: "bg-suggested",
  ready_to_write: "bg-dirty",
  writing: "bg-suggested animate-pulse",
  error: "bg-danger",
};

const NUMERIC_COLS: ReadonlySet<string> = new Set(
  COLUMNS.filter((c) => c.type === "number").map((c) => c.key),
);

/** Large delta used to jump to the first/last row or column (clamped). */
const BIG = 1_000_000;

/**
 * Match a cell value against a per-column filter expression. Numeric columns
 * understand ranges ("120-130"), comparisons (">120", "<=128") and exact
 * numbers; everything else is a case-insensitive substring match.
 */
function matchCol(value: string | number | null, expr: string, isNumber: boolean): boolean {
  const q = expr.trim();
  if (q === "") return true;
  if (isNumber) {
    const n = typeof value === "number" ? value : value === null ? null : Number(value);
    const range = q.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      return n !== null && n >= Number(range[1]) && n <= Number(range[2]);
    }
    const cmp = q.match(/^(<=|>=|<|>|=)\s*(\d+)$/);
    if (cmp) {
      if (n === null) return false;
      const t = Number(cmp[2]);
      if (cmp[1] === "<") return n < t;
      if (cmp[1] === "<=") return n <= t;
      if (cmp[1] === ">") return n > t;
      if (cmp[1] === ">=") return n >= t;
      return n === t;
    }
    if (/^\d+$/.test(q)) {
      return n !== null && String(n).includes(q);
    }
  }
  return displayValue(value).toLowerCase().includes(q.toLowerCase());
}

type GroupBy = "none" | "genre" | "key" | "bpm";

/** Group key (for sorting/collapse) + human label for a row under `by`. */
function groupOf(row: TrackRow, by: GroupBy): { key: string; label: string } {
  if (by === "genre") {
    const g = row.edited.genre.trim();
    return g ? { key: g.toLowerCase(), label: g } : { key: "~", label: "(sem gênero)" };
  }
  if (by === "key") {
    const k = row.edited.key.trim();
    return k ? { key: k.toLowerCase(), label: k } : { key: "~", label: "(sem tom)" };
  }
  const bpm = row.edited.bpm;
  if (bpm === null) return { key: "~", label: "(sem BPM)" };
  const lo = Math.floor(bpm / 10) * 10;
  return { key: String(lo).padStart(4, "0"), label: `${lo}–${lo + 9} BPM` };
}

export function TrackGrid() {
  const rows = useLibraryStore((s) => s.rows);
  const filter = useLibraryStore((s) => s.filter);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const lens = useLibraryStore((s) => s.lens);
  const setLens = useLibraryStore((s) => s.setLens);
  const selection = useLibraryStore((s) => s.selection);
  const anchor = useLibraryStore((s) => s.anchor);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const setAnchor = useLibraryStore((s) => s.setAnchor);
  const setCell = useLibraryStore((s) => s.setCell);
  const setCells = useLibraryStore((s) => s.setCells);
  const clearCells = useLibraryStore((s) => s.clearCells);
  const applySuggestion = useLibraryStore((s) => s.applySuggestion);
  const rejectSuggestion = useLibraryStore((s) => s.rejectSuggestion);
  const resetRow = useLibraryStore((s) => s.resetRow);
  const addToSetlist = useLibraryStore((s) => s.addToSetlist);
  const detectCues = useLibraryStore((s) => s.detectCues);
  const writeSeratoCues = useLibraryStore((s) => s.writeSeratoCues);
  const playRow = useLibraryStore((s) => s.playRow);
  const renameToTitle = useLibraryStore((s) => s.renameToTitle);
  const undoEdit = useLibraryStore((s) => s.undoEdit);
  const redoEdit = useLibraryStore((s) => s.redoEdit);
  const artwork = useLibraryStore((s) => s.artwork);
  const loadArtwork = useLibraryStore((s) => s.loadArtwork);
  const genres = useLibraryStore((s) => s.config.genres);
  const scan = useLibraryStore((s) => s.scan);
  const importLibrary = useLibraryStore((s) => s.importLibrary);
  const setHealthOpen = useLibraryStore((s) => s.setHealthOpen);

  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [sort, setSort] = useState<{ col: SortKey; dir: "asc" | "desc" } | null>(null);
  const [density, setDensity] = useState<Density>(() => loadDensity());
  const [showColFilters, setShowColFilters] = useState(false);
  // Per-column quick filters (key = TagKey or "fileName"); empty = no filter.
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [showViews, setShowViews] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    saveDensity(density);
  }, [density]);

  const saveCurrentView = useCallback(() => {
    const name = window.prompt("Nome da view (Smart Crate):")?.trim();
    if (!name) return;
    const view: SavedView = { name, filter, lens, sort, colFilters };
    setSavedViews((prev) => {
      const next = [...prev.filter((v) => v.name !== name), view];
      saveSavedViews(next);
      return next;
    });
    setShowViews(false);
  }, [filter, lens, sort, colFilters]);

  const applyView = useCallback(
    (v: SavedView) => {
      setFilter(v.filter);
      if (lens !== v.lens) setLens(v.lens);
      setSort(v.sort as { col: SortKey; dir: "asc" | "desc" } | null);
      setColFilters(v.colFilters ?? {});
      if (v.colFilters && Object.values(v.colFilters).some((x) => x.trim() !== "")) {
        setShowColFilters(true);
      }
      setShowViews(false);
    },
    [setFilter, setLens, lens],
  );

  const deleteView = useCallback((name: string) => {
    setSavedViews((prev) => {
      const next = prev.filter((v) => v.name !== name);
      saveSavedViews(next);
      return next;
    });
  }, []);
  const cellPad = density === "comfortable" ? "px-2 py-1.5" : "px-2 py-1";
  const hasColFilters = Object.values(colFilters).some((v) => v.trim() !== "");

  const analysis = useMemo(() => analyze(rows), [rows]);
  const visible = useMemo(() => {
    let base = selectVisible(rows, filter, lens, analysis);
    const active = Object.entries(colFilters).filter(([, v]) => v.trim() !== "");
    if (active.length > 0) {
      base = base.filter((row) =>
        active.every(([key, expr]) =>
          key === "fileName"
            ? matchCol(row.fileName, expr, false)
            : matchCol(row.edited[key as TagKey], expr, NUMERIC_COLS.has(key)),
        ),
      );
    }
    if (!sort) {
      return base;
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    const valueOf = (row: TrackRow): string | number | null => {
      if (sort.col === "duration") return row.durationSecs;
      if (sort.col === "fileName") return row.fileName;
      return row.edited[sort.col];
    };
    return [...base].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va === null || va === "") return 1; // empties last
      if (vb === null || vb === "") return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
  }, [rows, filter, lens, analysis, sort, colFilters]);

  // Flattened render list: when grouping is on, group headers are interleaved
  // with their rows (collapsed groups contribute only a header). This keeps the
  // table a single uniform list so virtualization still works.
  const items = useMemo<GridItem[]>(() => {
    if (groupBy === "none") {
      return visible.map((row, i) => ({ type: "row", row, seq: i + 1 }));
    }
    const order: string[] = [];
    const map = new Map<string, { label: string; rows: TrackRow[] }>();
    for (const row of visible) {
      const { key, label } = groupOf(row, groupBy);
      let g = map.get(key);
      if (!g) {
        g = { label, rows: [] };
        map.set(key, g);
        order.push(key);
      }
      g.rows.push(row);
    }
    order.sort((a, b) => {
      if (a === "~") return 1;
      if (b === "~") return -1;
      return a.localeCompare(b, "pt-BR", { numeric: true });
    });
    const out: GridItem[] = [];
    let seq = 0;
    for (const key of order) {
      const g = map.get(key)!;
      const collapsed = collapsedGroups.has(key);
      out.push({ type: "header", gkey: key, label: g.label, count: g.rows.length, collapsed });
      if (!collapsed) {
        for (const row of g.rows) {
          seq += 1;
          out.push({ type: "row", row, seq });
        }
      }
    }
    return out;
  }, [visible, groupBy, collapsedGroups]);

  // Rows in display order (respects grouping + collapsed groups). All keyboard
  // navigation / range math runs over this so it matches what's on screen.
  const orderedRows = useMemo(
    () => items.flatMap((it) => (it.type === "row" ? [it.row] : [])),
    [items],
  );

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSort = useCallback((col: SortKey) => {
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: "asc" };
      if (cur.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  }, []);

  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [draft, setDraft] = useState("");
  // The moving "active"/focus cell (distinct from `anchor`, the fixed range
  // corner). Arrow keys move `active`; Shift+arrows extend from `anchor`.
  const [active, setActive] = useState<{ rowId: string; colKey: TagKey } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  useEffect(() => {
    const stop = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  // Focus the grid and pick the first cell once rows load, so arrow keys and
  // type-to-edit work immediately without clicking first.
  useEffect(() => {
    if (active || orderedRows.length === 0) return;
    const first = orderedRows[0];
    const firstCol = COLUMNS[0];
    if (first && firstCol) {
      const cell = { rowId: first.id, colKey: firstCol.key };
      setActive(cell);
      setAnchor(cell);
      containerRef.current?.focus({ preventScroll: true });
    }
  }, [active, orderedRows, setAnchor]);

  // Resizable, persisted column widths.
  const [widths, setWidths] = useState<Record<string, number>>(() => loadColWidths(DEFAULT_WIDTHS));
  useEffect(() => {
    saveColWidths(widths);
  }, [widths]);
  const startResize = useCallback(
    (e: MouseEvent, key: TagKey) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widths[key] ?? 120;
      const onMove = (ev: globalThis.MouseEvent) => {
        const w = Math.max(50, startW + (ev.clientX - startX));
        setWidths((prev) => ({ ...prev, [key]: w }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths],
  );

  // Row virtualization (only kicks in for large libraries).
  const VIRT_THRESHOLD = 150;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [rowH, setRowH] = useState(33);
  useEffect(() => {
    if (containerRef.current) {
      setViewportH(containerRef.current.clientHeight);
    }
  }, [rows.length]);
  const virtualize = items.length > VIRT_THRESHOLD;
  const win = virtualize
    ? windowRange(scrollTop, viewportH, rowH, items.length)
    : { start: 0, end: items.length, topPad: 0, bottomPad: 0 };
  const colCount = COLUMNS.length + 4;
  const measureRow = (el: HTMLTableRowElement | null) => {
    if (el) {
      const h = el.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - rowH) > 0.5) {
        setRowH(h);
      }
    }
  };

  // Lazily load cover art for the rows currently in view.
  useEffect(() => {
    for (const item of items.slice(win.start, win.end)) {
      if (item.type === "row" && item.row.hasArtwork && !(item.row.id in artwork)) {
        void loadArtwork(item.row.id);
      }
    }
  }, [items, win.start, win.end, artwork, loadArtwork]);

  const windowItems = items.slice(win.start, win.end);
  const firstRowLocal = windowItems.findIndex((it) => it.type === "row");

  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>();
    orderedRows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [orderedRows]);

  // Index of each row within the flat `items` list (for scroll math).
  const itemIndexById = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it, i) => {
      if (it.type === "row") m.set(it.row.id, i);
    });
    return m;
  }, [items]);

  const colIndexByKey = useMemo(() => {
    const m = new Map<TagKey, number>();
    COLUMNS.forEach((c, i) => m.set(c.key, i));
    return m;
  }, []);

  // Scroll the container so a given row is visible (works with virtualization).
  const scrollRowIntoView = useCallback(
    (rowId: string) => {
      const el = containerRef.current;
      const idx = itemIndexById.get(rowId);
      if (!el || idx === undefined) return;
      const top = idx * rowH;
      const headerH = 60; // sticky header (+ filter row) approx
      if (top - headerH < el.scrollTop) {
        el.scrollTop = Math.max(0, top - headerH);
      } else if (top + rowH > el.scrollTop + el.clientHeight) {
        el.scrollTop = top + rowH - el.clientHeight;
      }
    },
    [itemIndexById, rowH],
  );

  const buildRange = useCallback(
    (r1: number, c1: number, r2: number, c2: number): Set<string> => {
      const keys = new Set<string>();
      const [rLo, rHi] = r1 <= r2 ? [r1, r2] : [r2, r1];
      const [cLo, cHi] = c1 <= c2 ? [c1, c2] : [c2, c1];
      for (let r = rLo; r <= rHi; r++) {
        const row = orderedRows[r];
        if (!row) continue;
        for (let c = cLo; c <= cHi; c++) {
          const col = COLUMNS[c];
          if (!col) continue;
          keys.add(cellKey(row.id, col.key));
        }
      }
      return keys;
    },
    [orderedRows],
  );

  const onCellMouseDown = useCallback(
    (e: MouseEvent, rowId: string, colKey: TagKey) => {
      if (editing) return;
      containerRef.current?.focus();
      const rowIndex = rowIndexById.get(rowId);
      const colIndex = colIndexByKey.get(colKey);
      if (rowIndex === undefined || colIndex === undefined) return;

      if (e.shiftKey && anchor) {
        const aRow = rowIndexById.get(anchor.rowId);
        const aCol = colIndexByKey.get(anchor.colKey);
        if (aRow !== undefined && aCol !== undefined) {
          setSelection(buildRange(aRow, aCol, rowIndex, colIndex));
          setActive({ rowId, colKey });
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(selection);
        const key = cellKey(rowId, colKey);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        setSelection(next);
        setAnchor({ rowId, colKey });
        setActive({ rowId, colKey });
        return;
      }
      setSelection(new Set([cellKey(rowId, colKey)]));
      setAnchor({ rowId, colKey });
      setActive({ rowId, colKey });
      draggingRef.current = true; // begin drag-select
    },
    [anchor, buildRange, colIndexByKey, editing, rowIndexById, selection, setAnchor, setSelection],
  );

  const onCellMouseEnter = useCallback(
    (rowId: string, colKey: TagKey) => {
      if (!draggingRef.current || !anchor) return;
      const aRow = rowIndexById.get(anchor.rowId);
      const aCol = colIndexByKey.get(anchor.colKey);
      const rowIndex = rowIndexById.get(rowId);
      const colIndex = colIndexByKey.get(colKey);
      if (aRow === undefined || aCol === undefined || rowIndex === undefined || colIndex === undefined) {
        return;
      }
      setSelection(buildRange(aRow, aCol, rowIndex, colIndex));
      setActive({ rowId, colKey });
    },
    [anchor, buildRange, colIndexByKey, rowIndexById, setSelection],
  );

  const selectColumn = useCallback(
    (col: ColumnDef) => {
      const keys = new Set<string>();
      for (const row of orderedRows) {
        keys.add(cellKey(row.id, col.key));
      }
      setSelection(keys);
      const first = orderedRows[0];
      const cell = first ? { rowId: first.id, colKey: col.key } : null;
      setAnchor(cell);
      setActive(cell);
    },
    [setAnchor, setSelection, orderedRows],
  );

  const selectRow = useCallback(
    (row: TrackRow) => {
      const keys = new Set<string>();
      for (const col of COLUMNS) {
        keys.add(cellKey(row.id, col.key));
      }
      setSelection(keys);
      const firstCol = COLUMNS[0];
      const cell = firstCol ? { rowId: row.id, colKey: firstCol.key } : null;
      setAnchor(cell);
      setActive(cell);
    },
    [setAnchor, setSelection],
  );

  const beginEdit = useCallback((row: TrackRow, colKey: TagKey) => {
    setEditing({ rowId: row.id, colKey });
    setDraft(displayValue(row.edited[colKey]));
  }, []);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    setCell(editing.rowId, editing.colKey, draft);
    setEditing(null);
  }, [draft, editing, setCell]);

  // Copy the bounding rectangle of the selected cells as TSV.
  const copySelection = useCallback(() => {
    if (selection.size === 0) return;
    let minR = Infinity;
    let maxR = -1;
    let minC = Infinity;
    let maxC = -1;
    for (const key of selection) {
      const sep = key.indexOf("::");
      const r = rowIndexById.get(key.slice(0, sep));
      const c = colIndexByKey.get(key.slice(sep + 2) as TagKey);
      if (r === undefined || c === undefined) continue;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
    }
    if (maxR < 0) return;
    const lines: string[] = [];
    for (let r = minR; r <= maxR; r++) {
      const row = orderedRows[r];
      if (!row) continue;
      const vals: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        const col = COLUMNS[c];
        if (col) vals.push(displayValue(row.edited[col.key]));
      }
      lines.push(vals.join("\t"));
    }
    void navigator.clipboard.writeText(lines.join("\n"));
  }, [selection, orderedRows, rowIndexById, colIndexByKey]);

  // Paste TSV starting at the anchor; a single value fills the whole selection.
  const pasteClipboard = useCallback(async () => {
    if (!anchor) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text) return;
    const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const single = grid.length === 1 && grid[0]?.length === 1 ? (grid[0][0] ?? "") : null;
    if (single !== null && selection.size > 1) {
      for (const key of selection) {
        const sep = key.indexOf("::");
        setCell(key.slice(0, sep), key.slice(sep + 2) as TagKey, single);
      }
      return;
    }
    const aRow = rowIndexById.get(anchor.rowId);
    const aCol = colIndexByKey.get(anchor.colKey);
    if (aRow === undefined || aCol === undefined) return;
    grid.forEach((cols, i) => {
      const row = orderedRows[aRow + i];
      if (!row) return;
      cols.forEach((val, j) => {
        const col = COLUMNS[aCol + j];
        if (col) setCell(row.id, col.key, val);
      });
    });
  }, [anchor, selection, orderedRows, rowIndexById, colIndexByKey, setCell]);

  // Excel-style fill-down: the top row of the selection rectangle seeds the
  // cells below it (per column), applied as one undo step.
  const fillDown = useCallback(() => {
    if (selection.size === 0) return;
    let minR = Infinity;
    let maxR = -1;
    let minC = Infinity;
    let maxC = -1;
    for (const key of selection) {
      const sep = key.indexOf("::");
      const r = rowIndexById.get(key.slice(0, sep));
      const c = colIndexByKey.get(key.slice(sep + 2) as TagKey);
      if (r === undefined || c === undefined) continue;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
    }
    if (maxR < 0 || maxR === minR) return; // need at least two rows
    const updates: { rowId: string; key: TagKey; raw: string }[] = [];
    for (let c = minC; c <= maxC; c++) {
      const col = COLUMNS[c];
      const src = orderedRows[minR];
      if (!col || !src) continue;
      const val = displayValue(src.edited[col.key]);
      for (let r = minR + 1; r <= maxR; r++) {
        const row = orderedRows[r];
        if (row) updates.push({ rowId: row.id, key: col.key, raw: val });
      }
    }
    setCells(updates);
  }, [selection, orderedRows, rowIndexById, colIndexByKey, setCells]);

  const selectAllVisible = useCallback(() => {
    const keys = new Set<string>();
    for (const row of orderedRows) {
      for (const col of COLUMNS) keys.add(cellKey(row.id, col.key));
    }
    setSelection(keys);
    const first = orderedRows[0];
    const firstCol = COLUMNS[0];
    const cell = first && firstCol ? { rowId: first.id, colKey: firstCol.key } : null;
    setAnchor(cell);
    setActive(cell);
  }, [orderedRows, setSelection, setAnchor]);

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
        // Move down to the same column after committing.
        if (editing) {
          const r = rowIndexById.get(editing.rowId);
          const next = r === undefined ? undefined : orderedRows[r + 1];
          if (next) {
            const cell = { rowId: next.id, colKey: editing.colKey };
            setSelection(new Set([cellKey(next.id, editing.colKey)]));
            setAnchor(cell);
            setActive(cell);
            scrollRowIntoView(next.id);
          }
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitEdit();
        // Commit and step to the next/previous column (Excel-style).
        if (editing) {
          const r = rowIndexById.get(editing.rowId);
          const c = colIndexByKey.get(editing.colKey);
          if (r !== undefined && c !== undefined) {
            const col = COLUMNS[e.shiftKey ? c - 1 : c + 1];
            const row = orderedRows[r];
            if (col && row) {
              const cell = { rowId: row.id, colKey: col.key };
              setSelection(new Set([cellKey(row.id, col.key)]));
              setAnchor(cell);
              setActive(cell);
            }
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditing(null);
      }
    },
    [commitEdit, editing, colIndexByKey, rowIndexById, setAnchor, setSelection, orderedRows, scrollRowIntoView],
  );

  const moveActive = useCallback(
    (dr: number, dc: number, extend = false) => {
      const cur = active ?? anchor;
      if (!cur) {
        const first = orderedRows[0];
        const firstCol = COLUMNS[0];
        if (first && firstCol) {
          const cell = { rowId: first.id, colKey: firstCol.key };
          setSelection(new Set([cellKey(first.id, firstCol.key)]));
          setAnchor(cell);
          setActive(cell);
        }
        return;
      }
      const r = rowIndexById.get(cur.rowId);
      const c = colIndexByKey.get(cur.colKey);
      if (r === undefined || c === undefined) return;
      const nr = Math.max(0, Math.min(orderedRows.length - 1, r + dr));
      const nc = Math.max(0, Math.min(COLUMNS.length - 1, c + dc));
      const row = orderedRows[nr];
      const col = COLUMNS[nc];
      if (!row || !col) return;
      const cell = { rowId: row.id, colKey: col.key };
      setActive(cell);
      if (extend && anchor) {
        const aR = rowIndexById.get(anchor.rowId);
        const aC = colIndexByKey.get(anchor.colKey);
        if (aR !== undefined && aC !== undefined) {
          setSelection(buildRange(aR, aC, nr, nc));
        }
      } else {
        setAnchor(cell);
        setSelection(new Set([cellKey(row.id, col.key)]));
      }
      scrollRowIntoView(row.id);
    },
    [active, anchor, buildRange, colIndexByKey, orderedRows, rowIndexById, scrollRowIntoView, setAnchor, setSelection],
  );

  const onGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (editing) return;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          undoEdit();
          return;
        }
        if (k === "y" || (k === "z" && e.shiftKey)) {
          e.preventDefault();
          redoEdit();
          return;
        }
        if (k === "c") {
          e.preventDefault();
          copySelection();
          return;
        }
        if (k === "v") {
          e.preventDefault();
          void pasteClipboard();
          return;
        }
        if (k === "d") {
          e.preventDefault();
          fillDown();
          return;
        }
        if (k === "a") {
          e.preventDefault();
          selectAllVisible();
          return;
        }
        if (k === "home") {
          e.preventDefault();
          moveActive(-BIG, -BIG, e.shiftKey);
          return;
        }
        if (k === "end") {
          e.preventDefault();
          moveActive(BIG, BIG, e.shiftKey);
          return;
        }
      }
      const pageRows = Math.max(1, Math.floor(viewportH / rowH) - 1);
      switch (e.key) {
        case "Delete":
        case "Backspace":
          if (selection.size > 0) {
            e.preventDefault();
            clearCells(selection);
          }
          return;
        case "ArrowUp":
          e.preventDefault();
          moveActive(-1, 0, e.shiftKey);
          return;
        case "ArrowDown":
          e.preventDefault();
          moveActive(1, 0, e.shiftKey);
          return;
        case "ArrowLeft":
          e.preventDefault();
          moveActive(0, -1, e.shiftKey);
          return;
        case "ArrowRight":
          e.preventDefault();
          moveActive(0, 1, e.shiftKey);
          return;
        case "Tab":
          e.preventDefault();
          moveActive(0, e.shiftKey ? -1 : 1);
          return;
        case "Home":
          e.preventDefault();
          moveActive(0, -BIG, e.shiftKey);
          return;
        case "End":
          e.preventDefault();
          moveActive(0, BIG, e.shiftKey);
          return;
        case "PageUp":
          e.preventDefault();
          moveActive(-pageRows, 0, e.shiftKey);
          return;
        case "PageDown":
          e.preventDefault();
          moveActive(pageRows, 0, e.shiftKey);
          return;
        case "Enter":
        case "F2": {
          const cur = active ?? anchor;
          const row = cur ? orderedRows[rowIndexById.get(cur.rowId) ?? -1] : undefined;
          if (cur && row) {
            e.preventDefault();
            beginEdit(row, cur.colKey);
          }
          return;
        }
        default:
          // Type a printable character to start editing the active cell.
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const cur = active ?? anchor;
            const row = cur ? orderedRows[rowIndexById.get(cur.rowId) ?? -1] : undefined;
            if (cur && row) {
              setEditing({ rowId: row.id, colKey: cur.colKey });
              setDraft(e.key);
              e.preventDefault();
            }
          }
      }
    },
    [active, anchor, beginEdit, clearCells, copySelection, editing, fillDown, moveActive, orderedRows, pasteClipboard, redoEdit, rowH, rowIndexById, selectAllVisible, selection, undoEdit, viewportH],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl text-muted-foreground/40">♪</div>
        <div>
          <p className="text-base font-medium text-foreground">Nenhuma faixa carregada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Escaneie uma pasta de músicas ou importe uma coleção/playlist para começar.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => void scan(false)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:brightness-110"
          >
            Abrir pasta
          </button>
          <button
            onClick={() => void scan(true)}
            className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
          >
            Abrir pasta + subpastas
          </button>
          <button
            onClick={() => void importLibrary()}
            className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
          >
            Importar coleção / playlist
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          Dica: pressione <kbd className="rounded bg-muted px-1 py-0.5">Ctrl K</kbd> para a paleta de comandos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">
          {visible.length} de {rows.length}
        </span>
        <button
          onClick={() => setShowColFilters((v) => !v)}
          className={cn(
            "rounded border px-2 py-0.5 transition-colors",
            showColFilters || hasColFilters
              ? "border-primary bg-primary/15 text-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
          title="Filtros por coluna (faixa de BPM, gênero, tom, …)"
        >
          Filtros por coluna{hasColFilters ? " (ativos)" : ""}
        </button>
        {hasColFilters && (
          <button
            onClick={() => setColFilters({})}
            className="text-muted-foreground underline hover:text-foreground"
          >
            limpar
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setShowViews((v) => !v)}
            className="rounded border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent"
            title="Views salvas (Smart Crates)"
          >
            Views ▾
          </button>
          {showViews && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowViews(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-background py-1 shadow-xl">
                <button
                  onClick={saveCurrentView}
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
                >
                  ＋ Salvar view atual…
                </button>
                {savedViews.length > 0 && <div className="my-1 h-px bg-border" />}
                {savedViews.length === 0 ? (
                  <div className="px-3 py-1.5 text-xs text-muted-foreground">Nenhuma view salva.</div>
                ) : (
                  savedViews.map((v) => (
                    <div key={v.name} className="flex items-center justify-between px-1">
                      <button
                        onClick={() => applyView(v)}
                        className="flex-1 truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                      >
                        {v.name}
                      </button>
                      <button
                        onClick={() => deleteView(v.name)}
                        aria-label={`Excluir view ${v.name}`}
                        className="px-1.5 text-xs text-muted-foreground hover:text-danger"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <select
          value={groupBy}
          onChange={(e) => {
            setGroupBy(e.target.value as GroupBy);
            setCollapsedGroups(new Set());
          }}
          className="rounded border border-border bg-background px-1.5 py-0.5 text-muted-foreground"
          title="Agrupar a grade"
        >
          <option value="none">Sem agrupar</option>
          <option value="genre">Agrupar: Gênero</option>
          <option value="key">Agrupar: Tom</option>
          <option value="bpm">Agrupar: BPM</option>
        </select>
        {groupBy !== "none" && (
          <>
            <button
              onClick={() =>
                setCollapsedGroups(
                  new Set(items.filter((i) => i.type === "header").map((i) => (i as { gkey: string }).gkey)),
                )
              }
              className="text-muted-foreground underline hover:text-foreground"
            >
              recolher
            </button>
            <button
              onClick={() => setCollapsedGroups(new Set())}
              className="text-muted-foreground underline hover:text-foreground"
            >
              expandir
            </button>
          </>
        )}
        <button
          onClick={() => setHealthOpen(true)}
          className="rounded border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent"
          title="Saúde da biblioteca"
        >
          Saúde
        </button>
        <div className="ml-auto flex items-center gap-1 text-muted-foreground">
          <span>Densidade</span>
          {(["compact", "comfortable"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                density === d ? "bg-accent text-foreground ring-1 ring-border" : "hover:bg-accent",
              )}
            >
              {d === "compact" ? "Compacta" : "Confortável"}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
          setViewportH(e.currentTarget.clientHeight);
        }}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
      <table className="w-max select-none border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="sticky left-0 z-20 w-12 border border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              #
            </th>
            <th className="w-9 border border-border bg-muted px-1 py-1.5 text-xs text-muted-foreground" aria-label="Capa" />
            {COLUMNS.map((col) => {
              const w = widths[col.key] ?? col.width;
              return (
                <th
                  key={col.key}
                  style={{ width: w, minWidth: w }}
                  onClick={(e) => (e.altKey ? selectColumn(col) : toggleSort(col.key))}
                  className="relative cursor-pointer select-none border border-border px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
                  title="Clique para ordenar · Alt+clique para selecionar a coluna"
                >
                  {col.label}
                  {sort?.col === col.key && <span className="ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                  <span
                    onMouseDown={(e) => startResize(e, col.key)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/50"
                    title="Arraste para redimensionar"
                  />
                </th>
              );
            })}
            <th
              onClick={() => toggleSort("duration")}
              className="cursor-pointer select-none border border-border px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground hover:text-foreground"
              title="Clique para ordenar por duração"
            >
              Tempo
              {sort?.col === "duration" && <span className="ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>}
            </th>
            <th
              onClick={() => toggleSort("fileName")}
              className="cursor-pointer select-none border border-border px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
              title="Clique para ordenar por arquivo"
            >
              Arquivo
              {sort?.col === "fileName" && <span className="ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>}
            </th>
          </tr>
          {showColFilters && (
            <tr>
              <th className="sticky left-0 z-20 border border-border bg-muted/70 p-0.5" />
              <th className="border border-border bg-muted/70 p-0.5" />
              {COLUMNS.map((col) => (
                <th key={col.key} className="border border-border bg-muted/70 p-0.5">
                  <input
                    value={colFilters[col.key] ?? ""}
                    onChange={(e) => setColFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                    placeholder={col.type === "number" ? "ex. 120-130" : "filtrar…"}
                    className="w-full rounded bg-background px-1 py-0.5 text-xs font-normal text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </th>
              ))}
              <th className="border border-border bg-muted/70 p-0.5" />
              <th className="border border-border bg-muted/70 p-0.5">
                <input
                  value={colFilters.fileName ?? ""}
                  onChange={(e) => setColFilters((f) => ({ ...f, fileName: e.target.value }))}
                  placeholder="filtrar…"
                  className="w-full rounded bg-background px-1 py-0.5 text-xs font-normal text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {win.topPad > 0 && (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: win.topPad, padding: 0, border: 0 }} />
            </tr>
          )}
          {windowItems.map((item, localIdx) => {
            if (item.type === "header") {
              return (
                <tr key={`h-${item.gkey}`} className="bg-muted/70">
                  <td colSpan={colCount} className="border border-border p-0">
                    <button
                      onClick={() => toggleGroup(item.gkey)}
                      className="sticky left-0 flex items-center gap-2 px-2 py-1.5 text-left text-xs font-medium text-foreground"
                    >
                      <span className="text-muted-foreground">{item.collapsed ? "▸" : "▾"}</span>
                      <span>{item.label}</span>
                      <span className="text-muted-foreground">({item.count})</span>
                    </button>
                  </td>
                </tr>
              );
            }
            const row = item.row;
            const rowIdx = item.seq - 1;
            const isDup = analysis.duplicates.has(row.id);
            const issues = analysis.issues.get(row.id);
            const rowTitle =
              issues && issues.length > 0
                ? `Inconsistências: ${issues.join(", ")}`
                : (row.error ?? "Clique para selecionar a linha inteira");
            return (
            <tr
              key={row.id}
              ref={localIdx === firstRowLocal ? measureRow : undefined}
              className={cn("hover:bg-muted/30", rowIdx % 2 === 1 && "bg-muted/15")}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, row });
              }}
            >
              <td
                onClick={() => selectRow(row)}
                className="sticky left-0 z-10 cursor-pointer select-none border border-border bg-muted px-1 py-1 text-center text-xs text-muted-foreground"
                title={rowTitle}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_COLOR[row.status])} />
                  {rowIdx + 1}
                  {isDup && <span className="font-bold text-suggested" title="Possível duplicata">D</span>}
                  {issues && issues.length > 0 && <span className="font-bold text-dirty">!</span>}
                </div>
              </td>
              <td
                className="cursor-pointer border border-border p-0.5 text-center align-middle hover:bg-accent"
                onClick={() => playRow(row.id)}
                title="Tocar"
              >
                {artwork[row.id] ? (
                  <img
                    src={artwork[row.id] as string}
                    alt=""
                    className="mx-auto h-7 w-7 rounded object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground/40">{row.hasArtwork ? "…" : "♪"}</span>
                )}
              </td>
              {COLUMNS.map((col) => {
                const key = cellKey(row.id, col.key);
                const selected = selection.has(key);
                const isActive = active?.rowId === row.id && active.colKey === col.key;
                const dirty = row.edited[col.key] !== row.original[col.key];
                const pending = row.suggested?.[col.key] !== undefined;
                const isEditing = editing?.rowId === row.id && editing.colKey === col.key;
                const value = row.edited[col.key];
                const keyColor =
                  col.key === "key" && typeof value === "string" ? camelotColor(value) : null;
                const w = widths[col.key] ?? col.width;
                const cellStyle: CSSProperties = { width: w, minWidth: w };
                if (keyColor && !selected && !isEditing) {
                  cellStyle.backgroundColor = keyColor;
                }
                return (
                  <td
                    key={col.key}
                    style={cellStyle}
                    onMouseDown={(e) => onCellMouseDown(e, row.id, col.key)}
                    onMouseEnter={() => onCellMouseEnter(row.id, col.key)}
                    onDoubleClick={() => beginEdit(row, col.key)}
                    className={cn(
                      "border border-border align-middle",
                      cellPad,
                      col.type === "number" ? "text-right tabular-nums" : "text-left",
                      pending && !isEditing && "group relative",
                      selected && "bg-primary/25 ring-1 ring-inset ring-primary",
                      pending && !selected && "bg-suggested/15 ring-1 ring-inset ring-suggested",
                      dirty && !selected && !pending && !keyColor && "bg-dirty/10",
                      isActive && !isEditing && "ring-2 ring-inset ring-primary",
                    )}
                    title={pending ? `IA sugere: ${displayValue(row.suggested?.[col.key] ?? null)}` : undefined}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draft}
                        list={col.key === "genre" ? "genre-bank" : undefined}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={onInputKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full bg-transparent text-foreground outline-none"
                      />
                    ) : col.key === "energy" ? (
                      <span className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => {
                          const filled = typeof value === "number" && value >= n;
                          return (
                            <button
                              key={n}
                              aria-label={`Energia ${n}`}
                              title={`Definir energia ${n}`}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCell(row.id, "energy", String(n));
                              }}
                              className={cn(filled ? "text-dirty" : "text-muted-foreground/40", "leading-none")}
                            >
                              {filled ? "●" : "○"}
                            </button>
                          );
                        })}
                      </span>
                    ) : (
                      <span className={cn("block truncate", dirty && "text-dirty")}>
                        {displayValue(value)}
                      </span>
                    )}
                    {pending && !isEditing && (
                      <span className="absolute right-0.5 top-1/2 z-10 hidden -translate-y-1/2 gap-0.5 group-hover:flex">
                        <button
                          aria-label="Aceitar sugestão"
                          title={`Aceitar: ${displayValue(row.suggested?.[col.key] ?? null)}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            applySuggestion(row.id, col.key);
                          }}
                          className="rounded bg-suggested px-1 text-[10px] font-bold leading-tight text-black hover:brightness-110"
                        >
                          ✓
                        </button>
                        <button
                          aria-label="Rejeitar sugestão"
                          title="Rejeitar sugestão"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            rejectSuggestion(row.id, col.key);
                          }}
                          className="rounded bg-danger px-1 text-[10px] font-bold leading-tight text-white hover:brightness-110"
                        >
                          ✗
                        </button>
                      </span>
                    )}
                  </td>
                );
              })}
              <td className={cn("border border-border text-right tabular-nums text-muted-foreground", cellPad)}>
                {formatDuration(row.durationSecs)}
              </td>
              <td
                className={cn("border border-border text-left text-muted-foreground", cellPad)}
                title={row.filePath}
              >
                <span className="block max-w-[420px] truncate">{row.fileName}</span>
              </td>
            </tr>
            );
          })}
          {win.bottomPad > 0 && (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: win.bottomPad, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {genres.length > 0 && (
        <datalist id="genre-bank">
          {genres.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      )}

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-md border border-border bg-background py-1 text-sm shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                playRow(menu.row.id);
                setMenu(null);
              }}
            >
              ▶ Tocar
            </button>
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                addToSetlist([menu.row.id]);
                setMenu(null);
              }}
            >
              Adicionar à setlist
            </button>
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                void detectCues(menu.row.id);
                setMenu(null);
              }}
            >
              Detectar cues / estrutura
            </button>
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-accent disabled:opacity-40"
              disabled={!/\.(mp3|flac)$/i.test(menu.row.fileName)}
              onClick={() => {
                const ok = window.confirm(
                  `Gravar cues no Serato (Markers2) em ${menu.row.fileName}?\n` +
                    "O arquivo original é copiado para backup antes.",
                );
                if (ok) {
                  void writeSeratoCues(menu.row.id);
                }
                setMenu(null);
              }}
            >
              Gravar cues no Serato (MP3/FLAC)
            </button>
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-accent disabled:opacity-40"
              disabled={!menu.row.edited.title.trim()}
              onClick={() => {
                const ok = window.confirm(
                  `Renomear o arquivo para "${menu.row.edited.title}"? (renomeia no disco)`,
                );
                if (ok) void renameToTitle([menu.row.id]);
                setMenu(null);
              }}
            >
              Renomear arquivo p/ título
            </button>
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                void revealInFiles(menu.row.filePath);
                setMenu(null);
              }}
            >
              Revelar no Finder/Explorer
            </button>
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-accent disabled:opacity-40"
              disabled={menu.row.status !== "ready_to_write" && menu.row.suggested === null}
              onClick={() => {
                resetRow(menu.row.id);
                setMenu(null);
              }}
            >
              Reverter edições da linha
            </button>
          </div>
        </>
      )}
    </div>
  );
}
