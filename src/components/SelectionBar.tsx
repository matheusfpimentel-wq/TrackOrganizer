import { useState } from "react";
import { useLibraryStore } from "@/store/useLibraryStore";

/**
 * Floating action bar shown while cells are selected (Library mode). Puts the
 * most common bulk edits next to the selection instead of up in the toolbar.
 */
export function SelectionBar() {
  const selection = useLibraryStore((s) => s.selection);
  const mode = useLibraryStore((s) => s.mode);
  const setCells = useLibraryStore((s) => s.setCells);
  const addToSetlist = useLibraryStore((s) => s.addToSetlist);
  const clearSelection = useLibraryStore((s) => s.clearSelection);
  const runAi = useLibraryStore((s) => s.runAi);
  const aiRunning = useLibraryStore((s) => s.aiRunning);
  const [genre, setGenre] = useState("");

  if (mode !== "library" || selection.size === 0) {
    return null;
  }

  const rowIds = (() => {
    const ids = new Set<string>();
    for (const key of selection) {
      const sep = key.indexOf("::");
      if (sep > 0) ids.add(key.slice(0, sep));
    }
    return [...ids];
  })();

  const applyGenre = () => {
    const v = genre.trim();
    if (!v) return;
    setCells(rowIds.map((id) => ({ rowId: id, key: "genre" as const, raw: v })));
    setGenre("");
  };
  const applyEnergy = (n: number) => {
    setCells(rowIds.map((id) => ({ rowId: id, key: "energy" as const, raw: String(n) })));
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-2xl backdrop-blur">
        <span className="text-xs text-muted-foreground">
          {rowIds.length} faixa(s) · {selection.size} célula(s)
        </span>
        <span className="mx-1 h-5 w-px bg-border" />
        <input
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyGenre();
          }}
          list="genre-bank"
          placeholder="Definir gênero…"
          className="h-7 w-40 rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={applyGenre}
          disabled={!genre.trim()}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
        >
          Aplicar
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Energia</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => applyEnergy(n)}
            className="rounded px-1.5 py-0.5 text-xs hover:bg-accent"
            title={`Definir energia ${n} na seleção`}
          >
            {n}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          onClick={() => void runAi()}
          disabled={aiRunning}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
        >
          Autotag
        </button>
        <button
          onClick={() => addToSetlist(rowIds)}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          + Setlist
        </button>
        <button
          onClick={clearSelection}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
