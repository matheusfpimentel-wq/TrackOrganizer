import { useEffect, useState } from "react";
import { Toolbar } from "@/components/Toolbar";
import { TrackGrid } from "@/components/TrackGrid";
import { StatusBar } from "@/components/StatusBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DiffReview } from "@/components/DiffReview";
import { useLibraryStore } from "@/store/useLibraryStore";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const loadConfig = useLibraryStore((s) => s.loadConfig);
  const writeResult = useLibraryStore((s) => s.writeResult);
  const clearWriteResult = useLibraryStore((s) => s.clearWriteResult);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold tracking-tight">Tracklistr</span>
        <span className="text-xs text-muted-foreground">organização de biblioteca de DJ</span>
      </header>
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="min-h-0 flex-1">
        <TrackGrid />
      </main>
      <StatusBar />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DiffReview />

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
