import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/store/useLibraryStore";
import { saveTextFile } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { toM3u8, toRekordboxXml, toRoteiroTxt, type SetlistEntry } from "@/lib/setlistExport";

const PLAYLIST_NAME = "Tracklistr Setlist";

export function SetlistPanel() {
  const open = useLibraryStore((s) => s.setlistOpen);
  const setOpen = useLibraryStore((s) => s.setSetlistOpen);
  const setlist = useLibraryStore((s) => s.setlist);
  const rows = useLibraryStore((s) => s.rows);
  const selection = useLibraryStore((s) => s.selection);
  const addToSetlist = useLibraryStore((s) => s.addToSetlist);
  const removeFromSetlist = useLibraryStore((s) => s.removeFromSetlist);
  const moveSetlistItem = useLibraryStore((s) => s.moveSetlistItem);
  const setTransitionNote = useLibraryStore((s) => s.setTransitionNote);
  const clearSetlist = useLibraryStore((s) => s.clearSetlist);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const entries = useMemo<SetlistEntry[]>(
    () =>
      setlist
        .map((s) => {
          const row = byId.get(s.rowId);
          return row ? { row, note: s.note } : null;
        })
        .filter((e): e is SetlistEntry => e !== null),
    [setlist, byId],
  );

  const totalSecs = useMemo(
    () => entries.reduce((sum, e) => sum + (e.row.durationSecs ?? 0), 0),
    [entries],
  );

  const addSelected = () => {
    const ids = new Set<string>();
    for (const key of selection) {
      const sep = key.indexOf("::");
      if (sep > 0) {
        ids.add(key.slice(0, sep));
      }
    }
    addToSetlist([...ids]);
  };

  const exportAs = async (kind: "m3u8" | "rekordbox" | "roteiro") => {
    if (entries.length === 0) {
      return;
    }
    if (kind === "m3u8") {
      await saveTextFile("setlist.m3u8", toM3u8(entries), [
        { name: "Playlist M3U8", extensions: ["m3u8"] },
      ]);
    } else if (kind === "rekordbox") {
      await saveTextFile("rekordbox.xml", toRekordboxXml(entries, PLAYLIST_NAME), [
        { name: "Rekordbox XML", extensions: ["xml"] },
      ]);
    } else {
      await saveTextFile("setlist-roteiro.txt", toRoteiroTxt(entries), [
        { name: "Texto", extensions: ["txt"] },
      ]);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
      <aside
        className="flex h-full w-[400px] flex-col border-l border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Setlist</h2>
            <p className="text-xs text-muted-foreground">
              {entries.length} faixa(s)
              {totalSecs > 0 ? ` · ${formatDuration(totalSecs)} de set` : ""}
            </p>
          </div>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button size="sm" onClick={addSelected} disabled={selection.size === 0}>
            Adicionar selecionadas
          </Button>
          {setlist.length > 0 && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={clearSetlist}>
              Limpar
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          {entries.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Selecione faixas na tabela e clique em <b>Adicionar selecionadas</b>.
            </p>
          ) : (
            <ol className="space-y-2">
              {entries.map(({ row, note }, i) => {
                const t = row.edited;
                const meta = [t.bpm != null ? `${t.bpm} BPM` : "", t.key ? t.key : ""]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={row.id} className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {t.artist ? `${t.artist} — ` : ""}
                          <span className="font-medium">{t.title || row.fileName}</span>
                        </div>
                        {meta && <div className="text-[11px] text-muted-foreground">{meta}</div>}
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          className="px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveSetlistItem(i, -1)}
                          disabled={i === 0}
                          title="Subir"
                        >
                          ▲
                        </button>
                        <button
                          className="px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveSetlistItem(i, 1)}
                          disabled={i === entries.length - 1}
                          title="Descer"
                        >
                          ▼
                        </button>
                      </div>
                      <button
                        className="shrink-0 px-1 text-xs text-danger hover:opacity-80"
                        onClick={() => removeFromSetlist(i)}
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                    {i < entries.length - 1 && (
                      <input
                        value={note}
                        onChange={(e) => setTransitionNote(i, e.target.value)}
                        placeholder="↳ transição para a próxima (ex.: corta no drop, eco + EQ)"
                        className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3">
          <Button size="sm" variant="outline" disabled={entries.length === 0} onClick={() => void exportAs("m3u8")}>
            .m3u8
          </Button>
          <Button size="sm" variant="outline" disabled={entries.length === 0} onClick={() => void exportAs("rekordbox")}>
            Rekordbox XML
          </Button>
          <Button size="sm" variant="outline" disabled={entries.length === 0} onClick={() => void exportAs("roteiro")}>
            Roteiro .txt
          </Button>
        </div>
      </aside>
    </div>
  );
}
