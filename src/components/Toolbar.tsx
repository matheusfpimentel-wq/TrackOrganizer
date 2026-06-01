import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterRows, useLibraryStore } from "@/store/useLibraryStore";
import { downloadText, rowsToCsv, rowsToTxt } from "@/lib/export";

export function Toolbar() {
  const scan = useLibraryStore((s) => s.scan);
  const scanning = useLibraryStore((s) => s.scanning);
  const filter = useLibraryStore((s) => s.filter);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const rows = useLibraryStore((s) => s.rows);
  const selection = useLibraryStore((s) => s.selection);

  const visible = useMemo(() => filterRows(rows, filter), [rows, filter]);

  const selectedRowCount = useMemo(() => {
    const ids = new Set<string>();
    for (const key of selection) {
      const sep = key.indexOf("::");
      if (sep > 0) {
        ids.add(key.slice(0, sep));
      }
    }
    return ids.size;
  }, [selection]);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
      <Button onClick={() => void scan()} disabled={scanning}>
        {scanning ? "Escaneando…" : "Abrir pasta"}
      </Button>

      <div className="mx-1 h-6 w-px bg-border" />

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Buscar (título, artista, álbum, gênero, arquivo)…"
        className="w-80"
      />

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={visible.length === 0}
          onClick={() => downloadText("tracklist.csv", rowsToCsv(visible))}
        >
          Exportar CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={visible.length === 0}
          onClick={() => downloadText("tracklist.txt", rowsToTxt(visible))}
        >
          Exportar TXT
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        {/* AI is intentionally not wired yet — awaiting validation. */}
        <Button
          variant="default"
          size="sm"
          disabled
          title="Será habilitado após validação do scaffold"
        >
          Taggear com IA {selectedRowCount > 0 ? `(${selectedRowCount})` : ""}
        </Button>
      </div>
    </div>
  );
}
