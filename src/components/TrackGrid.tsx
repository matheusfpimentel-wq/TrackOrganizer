import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { COLUMNS, type ColumnDef, type TagKey, type TrackRow } from "@/types/track";
import { camelotColor, displayValue, energyDots, formatDuration } from "@/lib/format";
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

const STATUS_COLOR: Record<TrackRow["status"], string> = {
  pristine: "bg-transparent",
  pending_approval: "bg-suggested",
  ready_to_write: "bg-dirty",
  writing: "bg-suggested animate-pulse",
  error: "bg-danger",
};

export function TrackGrid() {
  const rows = useLibraryStore((s) => s.rows);
  const filter = useLibraryStore((s) => s.filter);
  const lens = useLibraryStore((s) => s.lens);
  const selection = useLibraryStore((s) => s.selection);
  const anchor = useLibraryStore((s) => s.anchor);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const setAnchor = useLibraryStore((s) => s.setAnchor);
  const setCell = useLibraryStore((s) => s.setCell);
  const clearCells = useLibraryStore((s) => s.clearCells);
  const resetRow = useLibraryStore((s) => s.resetRow);
  const addToSetlist = useLibraryStore((s) => s.addToSetlist);
  const detectCues = useLibraryStore((s) => s.detectCues);
  const writeSeratoCues = useLibraryStore((s) => s.writeSeratoCues);
  const genres = useLibraryStore((s) => s.config.genres);

  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [sort, setSort] = useState<{ col: SortKey; dir: "asc" | "desc" } | null>(null);

  const analysis = useMemo(() => analyze(rows), [rows]);
  const visible = useMemo(() => {
    const base = selectVisible(rows, filter, lens, analysis);
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
  }, [rows, filter, lens, analysis, sort]);

  const toggleSort = useCallback((col: SortKey) => {
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: "asc" };
      if (cur.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  }, []);

  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>();
    visible.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [visible]);

  const colIndexByKey = useMemo(() => {
    const m = new Map<TagKey, number>();
    COLUMNS.forEach((c, i) => m.set(c.key, i));
    return m;
  }, []);

  const buildRange = useCallback(
    (r1: number, c1: number, r2: number, c2: number): Set<string> => {
      const keys = new Set<string>();
      const [rLo, rHi] = r1 <= r2 ? [r1, r2] : [r2, r1];
      const [cLo, cHi] = c1 <= c2 ? [c1, c2] : [c2, c1];
      for (let r = rLo; r <= rHi; r++) {
        const row = visible[r];
        if (!row) continue;
        for (let c = cLo; c <= cHi; c++) {
          const col = COLUMNS[c];
          if (!col) continue;
          keys.add(cellKey(row.id, col.key));
        }
      }
      return keys;
    },
    [visible],
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
        return;
      }
      setSelection(new Set([cellKey(rowId, colKey)]));
      setAnchor({ rowId, colKey });
    },
    [anchor, buildRange, colIndexByKey, editing, rowIndexById, selection, setAnchor, setSelection],
  );

  const selectColumn = useCallback(
    (col: ColumnDef) => {
      const keys = new Set<string>();
      for (const row of visible) {
        keys.add(cellKey(row.id, col.key));
      }
      setSelection(keys);
      const first = visible[0];
      setAnchor(first ? { rowId: first.id, colKey: col.key } : null);
    },
    [setAnchor, setSelection, visible],
  );

  const selectRow = useCallback(
    (row: TrackRow) => {
      const keys = new Set<string>();
      for (const col of COLUMNS) {
        keys.add(cellKey(row.id, col.key));
      }
      setSelection(keys);
      const firstCol = COLUMNS[0];
      setAnchor(firstCol ? { rowId: row.id, colKey: firstCol.key } : null);
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

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
        // Move down to the same column after committing.
        if (editing) {
          const r = rowIndexById.get(editing.rowId);
          const next = r === undefined ? undefined : visible[r + 1];
          if (next) {
            setSelection(new Set([cellKey(next.id, editing.colKey)]));
            setAnchor({ rowId: next.id, colKey: editing.colKey });
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditing(null);
      }
    },
    [commitEdit, editing, rowIndexById, setAnchor, setSelection, visible],
  );

  const moveActive = useCallback(
    (dr: number, dc: number) => {
      if (!anchor) {
        const first = visible[0];
        const firstCol = COLUMNS[0];
        if (first && firstCol) {
          setSelection(new Set([cellKey(first.id, firstCol.key)]));
          setAnchor({ rowId: first.id, colKey: firstCol.key });
        }
        return;
      }
      const r = rowIndexById.get(anchor.rowId);
      const c = colIndexByKey.get(anchor.colKey);
      if (r === undefined || c === undefined) return;
      const nr = Math.max(0, Math.min(visible.length - 1, r + dr));
      const nc = Math.max(0, Math.min(COLUMNS.length - 1, c + dc));
      const row = visible[nr];
      const col = COLUMNS[nc];
      if (!row || !col) return;
      setSelection(new Set([cellKey(row.id, col.key)]));
      setAnchor({ rowId: row.id, colKey: col.key });
    },
    [anchor, colIndexByKey, rowIndexById, setAnchor, setSelection, visible],
  );

  const onGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (editing) return;
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
          moveActive(e.shiftKey ? -1 : -1, 0);
          return;
        case "ArrowDown":
          e.preventDefault();
          moveActive(1, 0);
          return;
        case "ArrowLeft":
          e.preventDefault();
          moveActive(0, -1);
          return;
        case "ArrowRight":
        case "Tab":
          e.preventDefault();
          moveActive(0, e.key === "Tab" && e.shiftKey ? -1 : 1);
          return;
        case "Enter":
          if (anchor) {
            const row = visible[rowIndexById.get(anchor.rowId) ?? -1];
            if (row) {
              e.preventDefault();
              beginEdit(row, anchor.colKey);
            }
          }
          return;
        default:
          // Type a printable character to start editing that cell.
          if (anchor && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const row = visible[rowIndexById.get(anchor.rowId) ?? -1];
            if (row) {
              setEditing({ rowId: row.id, colKey: anchor.colKey });
              setDraft(e.key);
              e.preventDefault();
            }
          }
      }
    },
    [anchor, beginEdit, clearCells, editing, moveActive, rowIndexById, selection, visible],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Nenhuma faixa carregada. Use <span className="mx-1 font-medium text-foreground">Abrir pasta</span> para escanear.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onGridKeyDown}
      className="h-full overflow-auto outline-none"
    >
      <table className="w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="sticky left-0 z-20 w-12 border border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              #
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width, minWidth: col.width }}
                onClick={(e) => (e.altKey ? selectColumn(col) : toggleSort(col.key))}
                className="cursor-pointer select-none border border-border px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
                title="Clique para ordenar · Alt+clique para selecionar a coluna"
              >
                {col.label}
                {sort?.col === col.key && <span className="ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
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
        </thead>
        <tbody>
          {visible.map((row, rowIdx) => {
            const isDup = analysis.duplicates.has(row.id);
            const issues = analysis.issues.get(row.id);
            const rowTitle =
              issues && issues.length > 0
                ? `Inconsistências: ${issues.join(", ")}`
                : (row.error ?? "Clique para selecionar a linha inteira");
            return (
            <tr
              key={row.id}
              className="hover:bg-muted/30"
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
              {COLUMNS.map((col) => {
                const key = cellKey(row.id, col.key);
                const selected = selection.has(key);
                const dirty = row.edited[col.key] !== row.original[col.key];
                const pending = row.suggested?.[col.key] !== undefined;
                const isEditing = editing?.rowId === row.id && editing.colKey === col.key;
                const value = row.edited[col.key];
                const keyColor =
                  col.key === "key" && typeof value === "string" ? camelotColor(value) : null;
                const cellStyle: CSSProperties = { width: col.width, minWidth: col.width };
                if (keyColor && !selected && !isEditing) {
                  cellStyle.backgroundColor = keyColor;
                }
                return (
                  <td
                    key={col.key}
                    style={cellStyle}
                    onMouseDown={(e) => onCellMouseDown(e, row.id, col.key)}
                    onDoubleClick={() => beginEdit(row, col.key)}
                    className={cn(
                      "border border-border px-2 py-1 align-middle",
                      col.type === "number" ? "text-right tabular-nums" : "text-left",
                      selected && "bg-primary/25 ring-1 ring-inset ring-primary",
                      pending && !selected && "bg-suggested/15 ring-1 ring-inset ring-suggested",
                      dirty && !selected && !pending && !keyColor && "bg-dirty/10",
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
                      <span
                        className={cn("block tracking-tight", dirty && "text-dirty")}
                        title={value !== null ? `Energia ${value}/5` : ""}
                      >
                        {energyDots(typeof value === "number" ? value : null)}
                      </span>
                    ) : (
                      <span className={cn("block truncate", dirty && "text-dirty")}>
                        {displayValue(value)}
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="border border-border px-2 py-1 text-right tabular-nums text-muted-foreground">
                {formatDuration(row.durationSecs)}
              </td>
              <td
                className="border border-border px-2 py-1 text-left text-muted-foreground"
                title={row.filePath}
              >
                <span className="block max-w-[420px] truncate">{row.fileName}</span>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

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
              disabled={!menu.row.fileName.toLowerCase().endsWith(".mp3")}
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
              Gravar cues no Serato (MP3)
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
