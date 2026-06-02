import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AI_FIELDS, type AiField, type TrackRow } from "@/types/track";
import { displayValue } from "@/lib/format";
import { useLibraryStore } from "@/store/useLibraryStore";

const FIELD_LABEL: Record<AiField, string> = {
  title: "Título",
  artist: "Artista",
  genre: "Gênero",
  energy: "Energia",
};

export function DiffReview() {
  const open = useLibraryStore((s) => s.reviewOpen);
  const rows = useLibraryStore((s) => s.rows);
  const applySuggestion = useLibraryStore((s) => s.applySuggestion);
  const rejectSuggestion = useLibraryStore((s) => s.rejectSuggestion);
  const applyAll = useLibraryStore((s) => s.applyAllSuggestions);
  const rejectAll = useLibraryStore((s) => s.rejectAllSuggestions);
  const setReviewOpen = useLibraryStore((s) => s.setReviewOpen);

  const pending = useMemo(() => rows.filter((r) => r.suggested), [rows]);
  const totalCells = useMemo(
    () => pending.reduce((n, r) => n + Object.keys(r.suggested ?? {}).length, 0),
    [pending],
  );

  if (!open) {
    return null;
  }

  const fieldsOf = (row: TrackRow): AiField[] =>
    AI_FIELDS.filter((f) => row.suggested?.[f] !== undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[82vh] w-[860px] flex-col rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">Revisar sugestões da IA</h2>
            <p className="text-xs text-muted-foreground">
              {totalCells} célula(s) em {pending.length} faixa(s) — original → sugerido
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={rejectAll}>
              Rejeitar tudo
            </Button>
            <Button size="sm" onClick={applyAll}>
              Aprovar tudo
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {pending.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma sugestão pendente. Feche para gravar o que aprovou.
            </p>
          ) : (
            <div className="space-y-4">
              {pending.map((row) => (
                <div key={row.id} className="rounded-md border border-border">
                  <div className="truncate border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium">
                    {row.fileName}
                  </div>
                  <div className="divide-y divide-border">
                    {fieldsOf(row).map((field) => (
                      <div key={field} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-16 shrink-0 text-xs text-muted-foreground">
                          {FIELD_LABEL[field]}
                        </span>
                        <span className="w-1/3 shrink-0 truncate text-muted-foreground line-through">
                          {displayValue(row.edited[field]) || "—"}
                        </span>
                        <span className="mr-auto w-1/3 shrink-0 truncate font-medium text-suggested">
                          {displayValue(row.suggested?.[field] ?? null) || "—"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          onClick={() => rejectSuggestion(row.id, field)}
                        >
                          Rejeitar
                        </Button>
                        <Button size="sm" onClick={() => applySuggestion(row.id, field)}>
                          Aprovar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setReviewOpen(false)}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
