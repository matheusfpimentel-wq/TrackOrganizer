import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import type { Cue } from "@/types/track";
import { useLibraryStore } from "@/store/useLibraryStore";

const W = 680;
const H = 96;

const CUE_COLOR: Record<Cue["kind"], string> = {
  intro: "hsl(160 84% 45%)",
  build: "hsl(38 92% 55%)",
  drop: "hsl(0 72% 55%)",
  break: "hsl(199 89% 55%)",
  outro: "hsl(240 5% 65%)",
};

export function CuePanel() {
  const open = useLibraryStore((s) => s.cueOpen);
  const setOpen = useLibraryStore((s) => s.setCueOpen);
  const structure = useLibraryStore((s) => s.structure);
  const loading = useLibraryStore((s) => s.structureLoading);
  const name = useLibraryStore((s) => s.structureName);

  if (!open) {
    return null;
  }

  const dur = structure?.durationSecs ?? 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[82vh] w-[740px] flex-col rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3">
          <h2 className="truncate text-base font-semibold">Cues &amp; estrutura — {name}</h2>
          {structure && (
            <p className="text-xs text-muted-foreground">
              {formatDuration(Math.round(structure.durationSecs))}
              {structure.bpm ? ` · ${structure.bpm} BPM` : ""} · {structure.cues.length} cues
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading || !structure ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Analisando áudio…</p>
          ) : (
            <>
              <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" preserveAspectRatio="none">
                {/* waveform */}
                {structure.envelope.map((v, i) => {
                  const x = (i / structure.envelope.length) * W;
                  const h = Math.max(1, v * H);
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={H - h}
                      width={W / structure.envelope.length + 0.5}
                      height={h}
                      fill="hsl(240 4% 38%)"
                    />
                  );
                })}
                {/* cue markers */}
                {structure.cues.map((c, i) => {
                  const x = (c.positionSecs / dur) * W;
                  return (
                    <g key={i}>
                      <line x1={x} y1={0} x2={x} y2={H} stroke={CUE_COLOR[c.kind]} strokeWidth={2} />
                      <text x={x + 2} y={H + 14} fontSize={11} fill={CUE_COLOR[c.kind]}>
                        {c.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <ul className="mt-4 space-y-1">
                {structure.cues.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CUE_COLOR[c.kind] }}
                    />
                    <span className="w-16 tabular-nums text-muted-foreground">
                      {formatDuration(Math.round(c.positionSecs))}
                    </span>
                    <span>{c.label}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-[11px] text-muted-foreground">
                Cues detectados por energia (heurística) — um ponto de partida pra ajustar. A
                gravação como Memory Cues nativos (Rekordbox/Serato/Traktor) entra na Fase 2.
              </p>
            </>
          )}
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
