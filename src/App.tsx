import { Toolbar } from "@/components/Toolbar";
import { TrackGrid } from "@/components/TrackGrid";
import { StatusBar } from "@/components/StatusBar";

export default function App() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold tracking-tight">Tracklistr</span>
        <span className="text-xs text-muted-foreground">organização de biblioteca de DJ</span>
      </header>
      <Toolbar />
      <main className="min-h-0 flex-1">
        <TrackGrid />
      </main>
      <StatusBar />
    </div>
  );
}
