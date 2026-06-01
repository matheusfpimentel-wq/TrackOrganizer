import { useMemo } from "react";
import { filterRows, useLibraryStore } from "@/store/useLibraryStore";

export function StatusBar() {
  const rows = useLibraryStore((s) => s.rows);
  const filter = useLibraryStore((s) => s.filter);
  const selection = useLibraryStore((s) => s.selection);
  const folder = useLibraryStore((s) => s.folder);
  const globalError = useLibraryStore((s) => s.globalError);

  const stats = useMemo(() => {
    const visible = filterRows(rows, filter).length;
    let dirty = 0;
    let errors = 0;
    let missingGenre = 0;
    for (const row of rows) {
      if (row.status === "ready_to_write") dirty++;
      if (row.status === "error") errors++;
      if (!row.edited.genre.trim()) missingGenre++;
    }
    return { visible, dirty, errors, missingGenre };
  }, [rows, filter]);

  return (
    <div className="flex items-center gap-4 border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
      <span>{rows.length} faixas</span>
      <span>{stats.visible} visíveis</span>
      <span>{selection.size} células selecionadas</span>
      <span className="text-dirty">{stats.dirty} editadas</span>
      <span>{stats.missingGenre} sem gênero</span>
      {stats.errors > 0 && <span className="text-danger">{stats.errors} com erro</span>}
      <span className="ml-auto max-w-[50%] truncate" title={folder ?? ""}>
        {globalError ? <span className="text-danger">{globalError}</span> : folder}
      </span>
    </div>
  );
}
