import { useEffect, useMemo, useRef, useState } from "react";
import { analyze, selectVisible, useLibraryStore } from "@/store/useLibraryStore";
import { downloadText, rowsToCsv, rowsToTxt } from "@/lib/export";
import { cn } from "@/lib/utils";

interface Cmd {
  id: string;
  label: string;
  group: string;
  hint?: string;
  /** When present and false, the command is hidden (not applicable now). */
  enabled?: () => boolean;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenFind: () => void;
}

/**
 * Fuzzy command launcher (Ctrl/Cmd+K). Surfaces the app's actions in one place
 * so common tasks are a couple of keystrokes away instead of hunting the toolbar.
 */
export function CommandPalette({ open, onClose, onOpenSettings, onOpenFind }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Cmd[] = useMemo(() => {
    const st = () => useLibraryStore.getState();
    const wrap = (fn: () => void) => () => {
      fn();
      onClose();
    };
    const visibleRows = () => {
      const { rows, filter, lens } = st();
      return selectVisible(rows, filter, lens, analyze(rows));
    };
    return [
      { id: "scan", group: "Biblioteca", label: "Abrir pasta", hint: "escanear", run: wrap(() => void st().scan(false)) },
      { id: "scan-rec", group: "Biblioteca", label: "Abrir pasta + subpastas", run: wrap(() => void st().scan(true)) },
      { id: "import", group: "Biblioteca", label: "Importar coleção / playlist", run: wrap(() => void st().importLibrary()) },
      { id: "find", group: "Edição", label: "Localizar e substituir", run: wrap(onOpenFind) },
      { id: "pattern", group: "Edição", label: "Aplicar padrão de título", run: wrap(() => st().applyTitlePattern()) },
      { id: "undo", group: "Edição", label: "Desfazer edição", run: wrap(() => st().undoEdit()) },
      { id: "redo", group: "Edição", label: "Refazer edição", run: wrap(() => st().redoEdit()) },
      {
        id: "autotag",
        group: "IA",
        label: "Autotag da seleção",
        enabled: () => st().selection.size > 0 && !st().aiRunning,
        run: wrap(() => void st().runAi()),
      },
      {
        id: "review",
        group: "IA",
        label: "Revisar sugestões da IA",
        enabled: () => st().rows.some((r) => r.suggested),
        run: wrap(() => st().setReviewOpen(true)),
      },
      {
        id: "write",
        group: "Gravar",
        label: "Gravar alterações no disco",
        enabled: () => st().rows.some((r) => r.status === "ready_to_write"),
        run: wrap(() => st().setWriteConfirmOpen(true)),
      },
      {
        id: "deepscan",
        group: "Análise",
        label: "Deep Scan da seleção",
        enabled: () => st().selection.size > 0,
        run: wrap(() => void st().runDeepScan()),
      },
      { id: "dups", group: "Análise", label: "Detectar duplicatas por áudio", run: wrap(() => void st().runAudioDuplicates()) },
      {
        id: "cues",
        group: "Análise",
        label: "Detectar cues da seleção",
        enabled: () => st().selection.size > 0,
        run: wrap(() => void st().detectCuesForSelection()),
      },
      { id: "setlist", group: "Export", label: "Abrir setlist", run: wrap(() => st().setSetlistOpen(true)) },
      { id: "csv", group: "Export", label: "Exportar CSV (visível)", run: wrap(() => downloadText("tracklist.csv", rowsToCsv(visibleRows()))) },
      { id: "txt", group: "Export", label: "Exportar TXT (visível)", run: wrap(() => downloadText("tracklist.txt", rowsToTxt(visibleRows()))) },
      { id: "mode-lib", group: "Navegar", label: "Modo: Biblioteca", run: wrap(() => st().setMode("library")) },
      { id: "mode-an", group: "Navegar", label: "Modo: Análise", run: wrap(() => st().setMode("analysis")) },
      { id: "mode-ex", group: "Navegar", label: "Modo: Export", run: wrap(() => st().setMode("export")) },
      {
        id: "clear-filter",
        group: "Navegar",
        label: "Limpar busca",
        enabled: () => st().filter.length > 0,
        run: wrap(() => st().setFilter("")),
      },
      { id: "settings", group: "Navegar", label: "Configurações", run: wrap(onOpenSettings) },
    ];
  }, [onClose, onOpenFind, onOpenSettings]);

  const filtered = useMemo(() => {
    const avail = commands.filter((c) => (c.enabled ? c.enabled() : true));
    const q = query.trim().toLowerCase();
    if (!q) return avail;
    return avail.filter((c) => `${c.label} ${c.group} ${c.hint ?? ""}`.toLowerCase().includes(q));
    // `open` is intentionally a dep so enabled() is re-evaluated each time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, query, open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) {
    return null;
  }

  const run = (i: number) => {
    filtered[i]?.run();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(active);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Digite um comando…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="max-h-[50vh] overflow-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum comando.</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(i)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2 text-left text-sm",
                  i === active ? "bg-primary/20 text-foreground" : "text-foreground/90 hover:bg-accent",
                )}
              >
                <span>{cmd.label}</span>
                <span className="ml-3 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {cmd.group}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
          ↑↓ navegar · Enter executar · Esc fechar
        </div>
      </div>
    </div>
  );
}
