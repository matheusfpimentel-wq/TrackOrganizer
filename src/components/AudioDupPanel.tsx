import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/store/useLibraryStore";
import { revealInFiles } from "@/lib/api";

export function AudioDupPanel() {
  const open = useLibraryStore((s) => s.audioDupOpen);
  const setOpen = useLibraryStore((s) => s.setAudioDupOpen);
  const groups = useLibraryStore((s) => s.audioDups);
  const rows = useLibraryStore((s) => s.rows);

  const nameByPath = useMemo(() => new Map(rows.map((r) => [r.filePath, r.fileName])), [rows]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[82vh] w-[640px] flex-col rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Duplicatas por áudio (fingerprint)</h2>
          <p className="text-xs text-muted-foreground">
            {groups.length === 0
              ? "Nenhum par com o mesmo áudio encontrado."
              : `${groups.length} grupo(s) de faixas com o mesmo áudio (ignora nome/tags).`}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              As faixas analisadas têm áudios distintos.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((g, i) => (
                <div key={i} className="rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                    <span className="text-xs font-medium">Grupo {i + 1} — {g.files.length} arquivos</span>
                    <span className="rounded bg-suggested/20 px-1.5 py-0.5 text-xs text-suggested">
                      {Math.round(g.similarity * 100)}% semelhança
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.files.map((f) => (
                      <li key={f} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="min-w-0 flex-1 truncate" title={f}>
                          {nameByPath.get(f) ?? f}
                        </span>
                        <button
                          className="shrink-0 text-xs text-primary underline"
                          onClick={() => void revealInFiles(f)}
                        >
                          revelar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
