import { useMemo } from "react";
import { analyze, useLibraryStore } from "@/store/useLibraryStore";
import type { Lens } from "@/lib/analysis";

/**
 * Library health dashboard: at-a-glance counts of common problems, each card
 * clickable to filter the grid by that issue (via the existing lens system).
 */
export function HealthPanel() {
  const open = useLibraryStore((s) => s.healthOpen);
  const setOpen = useLibraryStore((s) => s.setHealthOpen);
  const rows = useLibraryStore((s) => s.rows);
  const setLens = useLibraryStore((s) => s.setLens);
  const setMode = useLibraryStore((s) => s.setMode);

  const a = useMemo(() => analyze(rows), [rows]);

  if (!open) {
    return null;
  }

  const total = rows.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const apply = (l: Lens) => {
    if (useLibraryStore.getState().lens !== l) setLens(l);
    setMode("library");
    setOpen(false);
  };

  const cards: { lens: Lens; label: string; count: number }[] = [
    { lens: "no-genre", label: "Sem gênero", count: a.noGenre.size },
    { lens: "no-bpm", label: "Sem BPM", count: a.noBpm.size },
    { lens: "no-artwork", label: "Sem capa", count: a.noArtwork.size },
    { lens: "duplicates", label: "Possíveis duplicatas", count: a.duplicates.size },
    { lens: "issues", label: "Inconsistências", count: a.issues.size },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <div
        className="w-[480px] max-w-[92vw] rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Saúde da biblioteca</h2>
          <span className="text-xs text-muted-foreground">{total} faixas</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cards.map((c) => (
            <button
              key={c.lens}
              onClick={() => apply(c.lens)}
              disabled={c.count === 0}
              className="rounded-md border border-border p-3 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-40"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">{c.count}</span>
                <span className="text-xs text-muted-foreground">{pct(c.count)}%</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary" style={{ width: `${pct(c.count)}%` }} />
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Clique num cartão para filtrar a biblioteca por esse problema.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
