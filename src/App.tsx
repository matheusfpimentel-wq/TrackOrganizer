import { useEffect, useState } from "react";
import { Toolbar } from "@/components/Toolbar";
import { TrackGrid } from "@/components/TrackGrid";
import { StatusBar } from "@/components/StatusBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DiffReview } from "@/components/DiffReview";
import { SetlistPanel } from "@/components/SetlistPanel";
import { WriteConfirm } from "@/components/WriteConfirm";
import { DeepScanPanel } from "@/components/DeepScanPanel";
import { AudioDupPanel } from "@/components/AudioDupPanel";
import { CuePanel } from "@/components/CuePanel";
import { PlayerBar } from "@/components/PlayerBar";
import { FindReplace } from "@/components/FindReplace";
import { CommandPalette } from "@/components/CommandPalette";
import { useLibraryStore } from "@/store/useLibraryStore";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const loadConfig = useLibraryStore((s) => s.loadConfig);
  const writeResult = useLibraryStore((s) => s.writeResult);
  const clearWriteResult = useLibraryStore((s) => s.clearWriteResult);
  const setWriteConfirmOpen = useLibraryStore((s) => s.setWriteConfirmOpen);
  const mode = useLibraryStore((s) => s.mode);
  const setMode = useLibraryStore((s) => s.setMode);

  const MODES = [
    { key: "library", label: "Biblioteca" },
    { key: "analysis", label: "Análise" },
    { key: "export", label: "Export" },
  ] as const;

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Global shortcuts: Ctrl/Cmd+K (command palette), Ctrl/Cmd+S (write),
  // "/" (focus the library search box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setWriteConfirmOpen(true);
      } else if (e.key === "/" && !typing && !mod && !e.altKey) {
        const el = document.getElementById("library-filter") as HTMLInputElement | null;
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setWriteConfirmOpen]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold tracking-tight">Tracklistr</span>
        <div className="flex items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={
                "rounded-md px-3 py-1 text-sm transition-colors " +
                (mode === m.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Paleta de comandos"
        >
          <span>Comandos</span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
        </button>
      </header>
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} onOpenFind={() => setFindOpen(true)} />
      <main className="min-h-0 flex-1">
        <TrackGrid />
      </main>
      <PlayerBar />
      <StatusBar />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FindReplace open={findOpen} onClose={() => setFindOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFind={() => setFindOpen(true)}
      />
      <DiffReview />
      <SetlistPanel />
      <WriteConfirm />
      <DeepScanPanel />
      <AudioDupPanel />
      <CuePanel />

      {writeResult && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-background px-4 py-3 text-sm shadow-xl">
          <div className="flex items-center gap-3">
            <span>
              Gravado: <span className="text-primary">{writeResult.ok} ok</span>
              {writeResult.failed > 0 && (
                <span className="text-danger">, {writeResult.failed} falhou</span>
              )}
            </span>
            <button className="text-xs text-muted-foreground underline" onClick={clearWriteResult}>
              ok
            </button>
          </div>
          <div className="mt-1 max-w-[360px] truncate text-[11px] text-muted-foreground">
            backup: {writeResult.backupPath}
          </div>
        </div>
      )}
    </div>
  );
}
