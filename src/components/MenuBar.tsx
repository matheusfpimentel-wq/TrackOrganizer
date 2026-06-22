import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { analyze, selectVisible, useLibraryStore } from "@/store/useLibraryStore";
import { downloadText, rowsToCsv, rowsToTxt } from "@/lib/export";
import { saveTextFile } from "@/lib/api";
import { toRekordboxXml } from "@/lib/setlistExport";
import { cn } from "@/lib/utils";

interface Props {
  onOpenSettings: () => void;
  onOpenFind: () => void;
  onOpenPalette: () => void;
}

interface Item {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}

/**
 * Compact menu-bar (Arquivo / Editar / IA / Análise) replacing the old
 * two-row header + toolbar, to free vertical space for the grid. Table view
 * controls (filters / group / columns) live in the grid's own strip.
 */
export function MenuBar({ onOpenSettings, onOpenFind, onOpenPalette }: Props) {
  const scan = useLibraryStore((st) => st.scan);
  const importLibrary = useLibraryStore((st) => st.importLibrary);
  const scanning = useLibraryStore((st) => st.scanning);
  const scanProgress = useLibraryStore((st) => st.scanProgress);
  const filter = useLibraryStore((st) => st.filter);
  const setFilter = useLibraryStore((st) => st.setFilter);
  const rows = useLibraryStore((st) => st.rows);
  const selection = useLibraryStore((st) => st.selection);
  const lens = useLibraryStore((st) => st.lens);
  const runAi = useLibraryStore((st) => st.runAi);
  const aiRunning = useLibraryStore((st) => st.aiRunning);
  const aiProgress = useLibraryStore((st) => st.aiProgress);
  const aiError = useLibraryStore((st) => st.aiError);
  const setAiError = useLibraryStore((st) => st.setAiError);
  const runEnrich = useLibraryStore((st) => st.runEnrich);
  const enriching = useLibraryStore((st) => st.enriching);
  const enrichProgress = useLibraryStore((st) => st.enrichProgress);
  const setReviewOpen = useLibraryStore((st) => st.setReviewOpen);
  const writing = useLibraryStore((st) => st.writing);
  const setWriteConfirmOpen = useLibraryStore((st) => st.setWriteConfirmOpen);
  const lastWrite = useLibraryStore((st) => st.lastWrite);
  const undoLastWrite = useLibraryStore((st) => st.undoLastWrite);
  const provider = useLibraryStore((st) => st.config.provider);
  const setSetlistOpen = useLibraryStore((st) => st.setSetlistOpen);
  const setlistCount = useLibraryStore((st) => st.setlist.length);
  const applyTitlePattern = useLibraryStore((st) => st.applyTitlePattern);
  const undoEdit = useLibraryStore((st) => st.undoEdit);
  const redoEdit = useLibraryStore((st) => st.redoEdit);
  const renameToTitle = useLibraryStore((st) => st.renameToTitle);
  const runDeepScan = useLibraryStore((st) => st.runDeepScan);
  const runAudioDuplicates = useLibraryStore((st) => st.runAudioDuplicates);
  const detectCuesForSelection = useLibraryStore((st) => st.detectCuesForSelection);
  const setHealthOpen = useLibraryStore((st) => st.setHealthOpen);
  const cuesByRow = useLibraryStore((st) => st.cuesByRow);

  const [open, setOpen] = useState<string | null>(null);

  const pendingCount = useMemo(() => rows.filter((r) => r.suggested).length, [rows]);
  const dirtyCount = useMemo(() => rows.filter((r) => r.status === "ready_to_write").length, [rows]);

  const selectionRowIds = () => {
    const ids = new Set<string>();
    for (const key of selection) {
      const sep = key.indexOf("::");
      if (sep > 0) ids.add(key.slice(0, sep));
    }
    return [...ids];
  };

  const exportXml = () => {
    const visible = selectVisible(rows, filter, lens, analyze(rows));
    const entries = visible.map((row) => {
      const cues = cuesByRow[row.id];
      return cues ? { row, note: "", cues } : { row, note: "" };
    });
    void saveTextFile("rekordbox.xml", toRekordboxXml(entries, "Tracklistr Collection"), [
      { name: "Rekordbox XML", extensions: ["xml"] },
    ]);
  };
  const exportCsv = () => {
    const visible = selectVisible(rows, filter, lens, analyze(rows));
    downloadText("tracklist.csv", rowsToCsv(visible));
  };
  const exportTxt = () => {
    const visible = selectVisible(rows, filter, lens, analyze(rows));
    downloadText("tracklist.txt", rowsToTxt(visible));
  };

  const renameSelection = () => {
    const ids = selectionRowIds();
    if (ids.length === 0) return;
    if (window.confirm(`Renomear ${ids.length} arquivo(s) no disco para o Título?`)) {
      void renameToTitle(ids);
    }
  };

  const menus: { id: string; label: string; items: (Item | "sep")[] }[] = [
    {
      id: "arquivo",
      label: "Arquivo",
      items: [
        { label: "Abrir pasta", onClick: () => void scan(false), disabled: scanning },
        { label: "Abrir pasta + subpastas", onClick: () => void scan(true), disabled: scanning },
        { label: "Importar coleção / playlist", onClick: () => void importLibrary(), disabled: scanning },
        "sep",
        { label: `Gravar alterações${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`, onClick: () => setWriteConfirmOpen(true), disabled: dirtyCount === 0 || writing },
        { label: "Desfazer última gravação", onClick: () => void undoLastWrite(), disabled: !lastWrite || writing },
        "sep",
        { label: "Exportar CSV", onClick: exportCsv },
        { label: "Exportar TXT", onClick: exportTxt },
        { label: "Exportar rekordbox XML", onClick: exportXml },
        { label: `Setlist${setlistCount > 0 ? ` (${setlistCount})` : ""}`, onClick: () => setSetlistOpen(true) },
      ],
    },
    {
      id: "editar",
      label: "Editar",
      items: [
        { label: "Desfazer", onClick: undoEdit, hint: "Ctrl+Z" },
        { label: "Refazer", onClick: redoEdit, hint: "Ctrl+Y" },
        "sep",
        { label: "Localizar e substituir", onClick: onOpenFind },
        { label: "Aplicar padrão de título", onClick: () => applyTitlePattern() },
        { label: "Renomear arquivos p/ título", onClick: renameSelection, disabled: selection.size === 0 },
      ],
    },
    {
      id: "ia",
      label: "IA",
      items: [
        { label: "Enriquecer (plataformas)", onClick: () => void runEnrich(), disabled: enriching },
        { label: "Autotag da seleção", onClick: () => void runAi(), disabled: aiRunning || selection.size === 0 },
        { label: `Revisar sugestões${pendingCount > 0 ? ` (${pendingCount})` : ""}`, onClick: () => setReviewOpen(true), disabled: pendingCount === 0 },
      ],
    },
    {
      id: "analise",
      label: "Análise",
      items: [
        { label: "Deep Scan (seleção)", onClick: () => void runDeepScan(), disabled: selection.size === 0 },
        { label: "Duplicatas por áudio", onClick: () => void runAudioDuplicates(), disabled: rows.length < 2 },
        { label: "Detectar cues (seleção)", onClick: () => void detectCuesForSelection(), disabled: selection.size === 0 },
        "sep",
        { label: "Saúde da biblioteca", onClick: () => setHealthOpen(true) },
      ],
    },
  ];

  const run = (item: Item) => {
    if (item.disabled) return;
    item.onClick();
    setOpen(null);
  };

  return (
    <div className="relative border-b border-border bg-muted/40">
      <div className="relative z-50 flex items-center gap-1 px-3 py-1.5 text-sm">
        <span className="mr-1 font-semibold tracking-tight">Tracklistr</span>

        {menus.map((m) => (
          <div key={m.id} className="relative">
            <button
              onClick={() => setOpen((o) => (o === m.id ? null : m.id))}
              onMouseEnter={() => setOpen((o) => (o !== null ? m.id : o))}
              className={cn(
                "rounded px-2 py-1 transition-colors",
                open === m.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {m.label}
            </button>
            {open === m.id && (
              <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-md border border-border bg-background py-1 shadow-xl">
                {m.items.map((it, i) =>
                  it === "sep" ? (
                    <div key={`sep-${i}`} className="my-1 h-px bg-border" />
                  ) : (
                    <button
                      key={it.label}
                      disabled={it.disabled}
                      onClick={() => run(it)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40"
                    >
                      <span>{it.label}</span>
                      {it.hint && <span className="ml-3 text-[10px] text-muted-foreground">{it.hint}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}

        <Input
          id="library-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar… ( / )"
          className="ml-2 w-56"
        />

        <div className="ml-auto flex items-center gap-2">
          {scanning && (
            <span className="text-xs text-muted-foreground">
              {scanProgress && scanProgress.total > 0
                ? `Escaneando ${scanProgress.done}/${scanProgress.total}…`
                : "Escaneando…"}
            </span>
          )}
          <span
            className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            title="Provedor de IA ativo (mude nas Configurações)"
          >
            {provider === "ollama" ? "Ollama" : "Claude"}
          </span>
          {enriching && enrichProgress && (
            <span className="text-xs text-muted-foreground">
              Enriquecendo {enrichProgress.done}/{enrichProgress.total}…
            </span>
          )}
          {aiRunning && aiProgress && (
            <span className="text-xs text-muted-foreground">
              Autotag {aiProgress.done}/{aiProgress.total}…
            </span>
          )}
          <button
            onClick={() => setWriteConfirmOpen(true)}
            disabled={dirtyCount === 0 || writing}
            className="rounded-md bg-dirty px-3 py-1 text-sm font-medium text-black transition-colors hover:brightness-110 disabled:opacity-40"
          >
            {writing ? "Gravando…" : `Gravar${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </button>
          <button
            onClick={onOpenPalette}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Paleta de comandos"
          >
            Comandos <kbd className="rounded bg-muted px-1 py-0.5 text-[10px]">Ctrl K</kbd>
          </button>
          <button
            onClick={onOpenSettings}
            title="Configurações"
            aria-label="Configurações"
            className="rounded-md border border-border px-2 py-1 text-base leading-none hover:bg-accent"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Click-away layer to close any open menu. */}
      {open !== null && <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />}

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
