import { useEffect, useState } from "react";
import { MenuBar } from "@/components/MenuBar";
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
import { SelectionBar } from "@/components/SelectionBar";
import { Toaster } from "@/components/Toaster";
import { HealthPanel } from "@/components/HealthPanel";
import { useLibraryStore } from "@/store/useLibraryStore";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const loadConfig = useLibraryStore((s) => s.loadConfig);
  const setWriteConfirmOpen = useLibraryStore((s) => s.setWriteConfirmOpen);

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
      <MenuBar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFind={() => setFindOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main className="min-h-0 flex-1">
        <TrackGrid />
      </main>
      <SelectionBar />
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
      <HealthPanel />
      <Toaster />
    </div>
  );
}
