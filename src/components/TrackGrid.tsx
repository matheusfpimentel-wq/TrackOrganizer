import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { COLUMNS, type ColumnDef, type TagKey, type TrackRow } from "@/types/track";
import { displayValue } from "@/lib/format";
import { cellKey, cn } from "@/lib/utils";
import { filterRows, useLibraryStore } from "@/store/useLibraryStore";

interface EditingCell {
  rowId: string;
  colKey: TagKey;
}

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
  const selection = useLibraryStore((s) => s.selection);
  const anchor = useLibraryStore((s) => s.anchor);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const setAnchor = useLibraryStore((s) => s.setAnchor);
  const setCell = useLibraryStore((s) => s.setCell);
  const clearCells = useLibraryStore((s) => s.clearCells);

  const visible = useMemo(() => filterRows(rows, filter), [rows, filter]);

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
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditing(null);
      }
    },
    [commitEdit],
  );

  const onGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (editing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selection.size > 0) {
        e.preventDefault();
        clearCells(selection);
      }
    },
    [clearCells, editing, selection],
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
                onClick={() => selectColumn(col)}
                className="cursor-pointer select-none border border-border px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
                title="Clique para selecionar a coluna inteira"
              >
                {col.label}
              </th>
            ))}
            <th className="border border-border px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">
              Arquivo
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, rowIdx) => (
            <tr key={row.id} className="hover:bg-muted/30">
              <td
                onClick={() => selectRow(row)}
                className="sticky left-0 z-10 cursor-pointer select-none border border-border bg-muted px-1 py-1 text-center text-xs text-muted-foreground"
                title={row.error ?? "Clique para selecionar a linha inteira"}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_COLOR[row.status])} />
                  {rowIdx + 1}
                </div>
              </td>
              {COLUMNS.map((col) => {
                const key = cellKey(row.id, col.key);
                const selected = selection.has(key);
                const dirty = row.edited[col.key] !== row.original[col.key];
                const isEditing = editing?.rowId === row.id && editing.colKey === col.key;
                return (
                  <td
                    key={col.key}
                    style={{ width: col.width, minWidth: col.width }}
                    onMouseDown={(e) => onCellMouseDown(e, row.id, col.key)}
                    onDoubleClick={() => beginEdit(row, col.key)}
                    className={cn(
                      "border border-border px-2 py-1 align-middle",
                      col.type === "number" ? "text-right tabular-nums" : "text-left",
                      selected && "bg-primary/25 ring-1 ring-inset ring-primary",
                      dirty && !selected && "bg-dirty/10",
                    )}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={onInputKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full bg-transparent text-foreground outline-none"
                      />
                    ) : (
                      <span className={cn("block truncate", dirty && "text-dirty")}>
                        {displayValue(row.edited[col.key])}
                      </span>
                    )}
                  </td>
                );
              })}
              <td
                className="border border-border px-2 py-1 text-left text-muted-foreground"
                title={row.filePath}
              >
                <span className="block max-w-[420px] truncate">{row.fileName}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
