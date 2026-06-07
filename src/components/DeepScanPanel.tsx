import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/store/useLibraryStore";

export function DeepScanPanel() {
  const open = useLibraryStore((s) => s.deepScanOpen);
  const setOpen = useLibraryStore((s) => s.setDeepScanOpen);
  const deepScan = useLibraryStore((s) => s.deepScan);
  const rows = useLibraryStore((s) => s.rows);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const entries = useMemo(
    () => Object.entries(deepScan).map(([id, result]) => ({ row: byId.get(id), result })),
    [deepScan, byId],
  );
  const suspectCount = entries.filter((e) => e.result.suspectTranscode).length;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[82vh] w-[760px] flex-col rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Deep Scan — análise de áudio</h2>
          <p className="text-xs text-muted-foreground">
            {entries.length} faixa(s) analisada(s)
            {suspectCount > 0 ? ` · ${suspectCount} suspeita(s) de transcode` : ""}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-1">Arquivo</th>
                <th className="px-2 py-1 text-right">kHz corte</th>
                <th className="px-2 py-1 text-right">Bitrate</th>
                <th className="px-2 py-1 text-right">Sample rate</th>
                <th className="px-2 py-1">Veredito</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ row, result }) => (
                <tr key={result.filePath} className="border-t border-border">
                  <td className="max-w-[260px] truncate px-2 py-1" title={result.filePath}>
                    {row?.fileName ?? result.filePath}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {(result.cutoffHz / 1000).toFixed(1)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {result.bitrateKbps ? `${result.bitrateKbps}k` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {(result.sampleRateHz / 1000).toFixed(1)} kHz
                  </td>
                  <td className="px-2 py-1">
                    {result.suspectTranscode ? (
                      <span className="rounded bg-danger/20 px-1.5 py-0.5 text-xs text-danger">
                        suspeito
                      </span>
                    ) : (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
