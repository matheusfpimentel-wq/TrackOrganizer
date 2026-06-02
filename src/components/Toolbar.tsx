import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyze, selectVisible, useLibraryStore } from "@/store/useLibraryStore";
import { downloadText, rowsToCsv, rowsToTxt } from "@/lib/export";

interface Props {
  onOpenSettings: () => void;
}

export function Toolbar({ onOpenSettings }: Props) {
  const scan = useLibraryStore((s) => s.scan);
  const scanning = useLibraryStore((s) => s.scanning);
  const filter = useLibraryStore((s) => s.filter);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const rows = useLibraryStore((s) => s.rows);
  const selection = useLibraryStore((s) => s.selection);
  const runAi = useLibraryStore((s) => s.runAi);
  const aiRunning = useLibraryStore((s) => s.aiRunning);
  const aiProgress = useLibraryStore((s) => s.aiProgress);
  const aiError = useLibraryStore((s) => s.aiError);
  const setAiError = useLibraryStore((s) => s.setAiError);
  const setReviewOpen = useLibraryStore((s) => s.setReviewOpen);
  const writeApproved = useLibraryStore((s) => s.writeApproved);
  const writing = useLibraryStore((s) => s.writing);
  const lens = useLibraryStore((s) => s.lens);
  const lastWrite = useLibraryStore((s) => s.lastWrite);
  const undoLastWrite = useLibraryStore((s) => s.undoLastWrite);

  const visible = useMemo(
    () => selectVisible(rows, filter, lens, analyze(rows)),
    [rows, filter, lens],
  );
  const pendingCount = useMemo(() => rows.filter((r) => r.suggested).length, [rows]);
  const dirtyCount = useMemo(() => rows.filter((r) => r.status === "ready_to_write").length, [rows]);

  const onWrite = async () => {
    if (dirtyCount === 0) {
      return;
    }
    const ok = window.confirm(
      `Gravar ${dirtyCount} faixa(s) editada(s) nos arquivos?\n` +
        "Um backup das tags atuais é criado automaticamente antes.",
    );
    if (ok) {
      await writeApproved();
    }
  };

  return (
    <div className="border-b border-border bg-muted/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button onClick={() => void scan()} disabled={scanning}>
          {scanning ? "Escaneando…" : "Abrir pasta"}
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar (título, artista, álbum, gênero, arquivo)…"
          className="w-72"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={visible.length === 0}
            onClick={() => downloadText("tracklist.csv", rowsToCsv(visible))}
          >
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={visible.length === 0}
            onClick={() => downloadText("tracklist.txt", rowsToTxt(visible))}
          >
            TXT
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <Button
            variant="default"
            size="sm"
            disabled={aiRunning || selection.size === 0}
            onClick={() => void runAi()}
          >
            {aiRunning && aiProgress
              ? `IA ${aiProgress.done}/${aiProgress.total}…`
              : "Taggear com IA"}
          </Button>

          {pendingCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)}>
              Revisar ({pendingCount})
            </Button>
          )}

          <Button
            variant="default"
            size="sm"
            className="bg-dirty text-black"
            disabled={dirtyCount === 0 || writing}
            onClick={() => void onWrite()}
          >
            {writing ? "Gravando…" : `Gravar (${dirtyCount})`}
          </Button>

          {lastWrite && (
            <Button
              variant="outline"
              size="sm"
              disabled={writing}
              onClick={() => void undoLastWrite()}
              title="Restaura as tags da última gravação a partir do backup"
            >
              Desfazer
            </Button>
          )}

          <div className="mx-1 h-6 w-px bg-border" />

          <Button variant="ghost" size="sm" onClick={onOpenSettings} title="Configurações">
            ⚙
          </Button>
        </div>
      </div>

      {aiError && (
        <div className="flex items-center gap-2 border-t border-border bg-danger/15 px-3 py-1.5 text-xs text-danger">
          <span className="flex-1">{aiError}</span>
          <button className="font-medium underline" onClick={() => setAiError(null)}>
            fechar
          </button>
        </div>
      )}
    </div>
  );
}
