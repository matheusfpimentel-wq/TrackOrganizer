import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { COLUMNS, type TrackRow } from "@/types/track";
import { displayValue } from "@/lib/format";
import { useLibraryStore } from "@/store/useLibraryStore";

function changedFields(row: TrackRow): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = [];
  for (const col of COLUMNS) {
    if (row.edited[col.key] !== row.original[col.key]) {
      out.push({
        label: col.label,
        from: displayValue(row.original[col.key]) || "—",
        to: displayValue(row.edited[col.key]) || "—",
      });
    }
  }
  return out;
}

export function WriteConfirm() {
  const open = useLibraryStore((s) => s.writeConfirmOpen);
  const setOpen = useLibraryStore((s) => s.setWriteConfirmOpen);
  const rows = useLibraryStore((s) => s.rows);
  const writeApproved = useLibraryStore((s) => s.writeApproved);
  const writing = useLibraryStore((s) => s.writing);

  const dirty = useMemo(() => rows.filter((r) => r.status === "ready_to_write"), [rows]);

  if (!open) {
    return null;
  }

  const confirm = async () => {
    await writeApproved();
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[80vh] w-[640px] flex-col rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Gravar {dirty.length} faixa(s)?</h2>
          <p className="text-xs text-muted-foreground">
            As tags abaixo serão escritas nos arquivos. Um backup das tags atuais é criado antes (undo disponível).
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <div className="space-y-3">
            {dirty.map((row) => (
              <div key={row.id} className="rounded-md border border-border">
                <div className="truncate border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium">
                  {row.fileName}
                </div>
                <div className="divide-y divide-border">
                  {changedFields(row).map((c) => (
                    <div key={c.label} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{c.label}</span>
                      <span className="w-1/3 shrink-0 truncate text-muted-foreground line-through">{c.from}</span>
                      <span className="truncate font-medium text-dirty">{c.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" disabled={writing || dirty.length === 0} onClick={() => void confirm()}>
            {writing ? "Gravando…" : "Gravar nos arquivos"}
          </Button>
        </div>
      </div>
    </div>
  );
}
