import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/store/useLibraryStore";
import { revealInFiles } from "@/lib/api";
import { COLUMNS, type TrackRow } from "@/types/track";
import { cellKey } from "@/lib/utils";

export function AudioDupPanel() {
  const open = useLibraryStore((s) => s.audioDupOpen);
  const setOpen = useLibraryStore((s) => s.setAudioDupOpen);
  const groups = useLibraryStore((s) => s.audioDups);
  const rows = useLibraryStore((s) => s.rows);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const setMode = useLibraryStore((s) => s.setMode);
  const pushToast = useLibraryStore((s) => s.pushToast);

  const nameByPath = useMemo(() => new Map(rows.map((r) => [r.filePath, r.fileName])), [rows]);
  const rowByPath = useMemo(() => new Map(rows.map((r) => [r.filePath, r])), [rows]);

  // "Best" copy of a group: prefer lossless, then artwork, then longest.
  const score = (r: TrackRow | undefined): number => {
    if (!r) return -1;
    const lossless = /flac|wav|aif/i.test(r.format) ? 1 : 0;
    const art = r.hasArtwork ? 1 : 0;
    return lossless * 1_000_000 + art * 100_000 + (r.durationSecs ?? 0);
  };
  const bestOf = (files: string[]): string =>
    [...files].sort((a, b) => score(rowByPath.get(b)) - score(rowByPath.get(a)))[0] ?? files[0] ?? "";

  const selectOthers = (fileGroups: string[][]) => {
    const keys = new Set<string>();
    let count = 0;
    for (const files of fileGroups) {
      const best = bestOf(files);
      for (const f of files) {
        if (f === best) continue;
        const row = rowByPath.get(f);
        if (!row) continue;
        count += 1;
        for (const col of COLUMNS) keys.add(cellKey(row.id, col.key));
      }
    }
    if (keys.size === 0) return;
    setSelection(keys);
    setMode("library");
    setOpen(false);
    pushToast({
      kind: "info",
      message: `${count} faixa(s) duplicada(s) selecionada(s)`,
      detail: "Mantida a melhor de cada grupo (lossless / com capa / mais longa).",
    });
  };

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
              {groups.map((g, i) => {
                const best = bestOf(g.files);
                return (
                <div key={i} className="rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                    <span className="text-xs font-medium">Grupo {i + 1} — {g.files.length} arquivos</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-suggested/20 px-1.5 py-0.5 text-xs text-suggested">
                        {Math.round(g.similarity * 100)}% semelhança
                      </span>
                      <button
                        className="text-xs text-primary underline"
                        onClick={() => selectOthers([g.files])}
                        title="Selecionar as outras na grade (mantém a melhor)"
                      >
                        selecionar outras
                      </button>
                    </div>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.files.map((f) => (
                      <li key={f} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="min-w-0 flex-1 truncate" title={f}>
                          {nameByPath.get(f) ?? f}
                        </span>
                        {f === best ? (
                          <span className="shrink-0 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            ★ melhor
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-muted-foreground">duplicada</span>
                        )}
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
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-between border-t border-border px-5 py-3">
          {groups.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectOthers(groups.map((g) => g.files))}
              title="Seleciona, na grade, todas as duplicatas exceto a melhor de cada grupo"
            >
              Selecionar todas as outras
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
