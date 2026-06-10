import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyze, selectVisible, useLibraryStore } from "@/store/useLibraryStore";
import { downloadText, rowsToCsv, rowsToTxt } from "@/lib/export";
import { saveTextFile } from "@/lib/api";
import { toRekordboxXml } from "@/lib/setlistExport";

interface Props {
  onOpenSettings: () => void;
}

export function Toolbar({ onOpenSettings }: Props) {
  const scan = useLibraryStore((s) => s.scan);
  const importLibrary = useLibraryStore((s) => s.importLibrary);
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
  const writing = useLibraryStore((s) => s.writing);
  const lens = useLibraryStore((s) => s.lens);
  const lastWrite = useLibraryStore((s) => s.lastWrite);
  const undoLastWrite = useLibraryStore((s) => s.undoLastWrite);
  const setSetlistOpen = useLibraryStore((s) => s.setSetlistOpen);
  const setlistCount = useLibraryStore((s) => s.setlist.length);
  const setWriteConfirmOpen = useLibraryStore((s) => s.setWriteConfirmOpen);
  const provider = useLibraryStore((s) => s.config.provider);
  const runDeepScan = useLibraryStore((s) => s.runDeepScan);
  const deepScanRunning = useLibraryStore((s) => s.deepScanRunning);
  const deepScanProgress = useLibraryStore((s) => s.deepScanProgress);
  const runAudioDuplicates = useLibraryStore((s) => s.runAudioDuplicates);
  const audioDupRunning = useLibraryStore((s) => s.audioDupRunning);
  const detectCuesForSelection = useLibraryStore((s) => s.detectCuesForSelection);
  const cueBatchRunning = useLibraryStore((s) => s.cueBatchRunning);
  const cueBatchProgress = useLibraryStore((s) => s.cueBatchProgress);
  const cuesByRow = useLibraryStore((s) => s.cuesByRow);

  const visible = useMemo(
    () => selectVisible(rows, filter, lens, analyze(rows)),
    [rows, filter, lens],
  );
  const pendingCount = useMemo(() => rows.filter((r) => r.suggested).length, [rows]);
  const dirtyCount = useMemo(() => rows.filter((r) => r.status === "ready_to_write").length, [rows]);

  const exportCollectionXml = () => {
    const entries = visible.map((row) => {
      const cues = cuesByRow[row.id];
      return cues ? { row, note: "", cues } : { row, note: "" };
    });
    void saveTextFile("rekordbox.xml", toRekordboxXml(entries, "Tracklistr Collection"), [
      { name: "Rekordbox XML", extensions: ["xml"] },
    ]);
  };

  return (
    <div className="border-b border-border bg-muted/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button onClick={() => void scan(false)} disabled={scanning} title="Escanear só esta pasta">
          {scanning ? "Escaneando…" : "Abrir pasta"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void scan(true)}
          disabled={scanning}
          title="Escanear esta pasta e todas as subpastas"
        >
          + Subpastas
        </Button>
        <Button
          variant="outline"
          onClick={() => void importLibrary()}
          disabled={scanning}
          title="Importar coleção Rekordbox (.xml) ou playlist (.m3u8)"
        >
          Importar
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
          <Button
            variant="outline"
            size="sm"
            disabled={visible.length === 0}
            onClick={exportCollectionXml}
            title="Exportar a coleção visível como rekordbox.xml"
          >
            RB XML
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSetlistOpen(true)}>
            Setlist{setlistCount > 0 ? ` (${setlistCount})` : ""}
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <span
            className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            title="Provedor de IA ativo (altere na engrenagem)"
          >
            {provider === "ollama" ? "Ollama" : "Claude"}
          </span>
          <Button
            variant="default"
            size="sm"
            disabled={aiRunning || selection.size === 0}
            onClick={() => void runAi()}
          >
            {aiRunning && aiProgress ? `Autotag ${aiProgress.done}/${aiProgress.total}…` : "Autotag"}
          </Button>

          {pendingCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)}>
              Revisar ({pendingCount})
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={deepScanRunning || selection.size === 0}
            onClick={() => void runDeepScan()}
            title="Análise de áudio das faixas selecionadas (corte de frequência / fake 320)"
          >
            {deepScanRunning && deepScanProgress
              ? `Deep Scan ${deepScanProgress.done}/${deepScanProgress.total}…`
              : "Deep Scan"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={audioDupRunning || rows.length < 2}
            onClick={() => void runAudioDuplicates()}
            title="Detectar duplicatas pelo áudio (fingerprint) — usa a seleção ou a biblioteca toda"
          >
            {audioDupRunning ? "Comparando…" : "Dup. áudio"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={cueBatchRunning || selection.size === 0}
            onClick={() => void detectCuesForSelection()}
            title="Detectar cues/estrutura nas faixas selecionadas (para exportar como POSITION_MARK)"
          >
            {cueBatchRunning && cueBatchProgress
              ? `Cues ${cueBatchProgress.done}/${cueBatchProgress.total}…`
              : "Cues (sel.)"}
          </Button>

          <Button
            variant="default"
            size="sm"
            className="bg-dirty text-black"
            disabled={dirtyCount === 0 || writing}
            onClick={() => setWriteConfirmOpen(true)}
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

          <Button
            variant="outline"
            size="md"
            onClick={onOpenSettings}
            title="Configurações"
            aria-label="Configurações"
            className="px-2.5 text-lg leading-none"
          >
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
