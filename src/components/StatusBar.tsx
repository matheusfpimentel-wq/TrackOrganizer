import { useMemo } from "react";
import { analyze, selectVisible, useLibraryStore } from "@/store/useLibraryStore";
import type { Lens } from "@/lib/analysis";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const rows = useLibraryStore((s) => s.rows);
  const filter = useLibraryStore((s) => s.filter);
  const lens = useLibraryStore((s) => s.lens);
  const setLens = useLibraryStore((s) => s.setLens);
  const selection = useLibraryStore((s) => s.selection);
  const folder = useLibraryStore((s) => s.folder);
  const globalError = useLibraryStore((s) => s.globalError);

  const analysis = useMemo(() => analyze(rows), [rows]);
  const visibleCount = useMemo(
    () => selectVisible(rows, filter, lens, analysis).length,
    [rows, filter, lens, analysis],
  );
  const dirty = useMemo(() => rows.filter((r) => r.status === "ready_to_write").length, [rows]);
  const errors = useMemo(() => rows.filter((r) => r.status === "error").length, [rows]);

  const chip = (value: Lens, label: string, count: number, tone: string) => (
    <button
      onClick={() => setLens(value)}
      className={cn(
        "rounded px-1.5 py-0.5 transition-colors hover:bg-accent",
        lens === value ? "bg-accent text-foreground ring-1 ring-border" : tone,
      )}
      title={`Filtrar: ${label}`}
    >
      {count} {label}
    </button>
  );

  return (
    <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
      <span>{rows.length} faixas</span>
      <span>{visibleCount} visíveis</span>
      <span>{selection.size} células sel.</span>
      <span className="text-dirty">{dirty} editadas</span>

      <span className="mx-1 h-3 w-px bg-border" />
      {chip("duplicates", "duplicatas", analysis.duplicates.size, "")}
      {chip("no-genre", "sem gênero", analysis.noGenre.size, "")}
      {chip("issues", "inconsistências", analysis.issues.size, "")}
      {errors > 0 && <span className="text-danger">{errors} com erro</span>}

      <span
        className="cursor-help rounded border border-border px-1.5 py-0.5"
        title={
          "Legenda dos status (ponto na linha):\n" +
          "• cinza = sem alteração\n" +
          "• laranja = editada (a gravar)\n" +
          "• azul = sugestão da IA pendente\n" +
          "• vermelho = erro de leitura\n" +
          "Marcadores: D = possível duplicata · ! = inconsistência"
        }
      >
        legenda
      </span>

      <span className="ml-auto max-w-[40%] truncate" title={folder ?? ""}>
        {globalError ? <span className="text-danger">{globalError}</span> : folder}
      </span>
    </div>
  );
}
