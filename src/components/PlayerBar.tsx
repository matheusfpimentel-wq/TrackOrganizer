import { useEffect, useMemo, useRef, useState } from "react";
import { useLibraryStore } from "@/store/useLibraryStore";
import { toPlayableSrc } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Cue } from "@/types/track";

const CUE_COLOR: Record<Cue["kind"], string> = {
  intro: "hsl(160 84% 45%)",
  build: "hsl(38 92% 55%)",
  drop: "hsl(0 72% 55%)",
  break: "hsl(199 89% 55%)",
  outro: "hsl(240 5% 65%)",
};

export function PlayerBar() {
  const playingRowId = useLibraryStore((s) => s.playingRowId);
  const rows = useLibraryStore((s) => s.rows);
  const cuesByRow = useLibraryStore((s) => s.cuesByRow);
  const artwork = useLibraryStore((s) => s.artwork);
  const seekTo = useLibraryStore((s) => s.seekTo);
  const clearSeek = useLibraryStore((s) => s.clearSeek);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);

  const row = useMemo(() => rows.find((r) => r.id === playingRowId) ?? null, [rows, playingRowId]);
  const cues = playingRowId ? (cuesByRow[playingRowId] ?? []) : [];
  const src = row ? toPlayableSrc(row.filePath) : "";

  // Load + autoplay when the track changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    el.src = src;
    el.load();
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [src]);

  // Honor external seek requests (e.g. clicking a cue in another panel).
  useEffect(() => {
    if (seekTo !== null && audioRef.current) {
      audioRef.current.currentTime = seekTo;
      clearSeek();
    }
  }, [seekTo, clearSeek]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  if (!row) {
    return null;
  }

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const seek = (secs: number) => {
    if (audioRef.current) audioRef.current.currentTime = secs;
    setCurrent(secs);
  };

  const dur = duration || row.durationSecs || 0;
  const pct = dur > 0 ? (current / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-3 border-t border-border bg-muted/60 px-3 py-2">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
      />

      {artwork[row.id] ? (
        <img src={artwork[row.id] as string} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent text-muted-foreground">
          ♪
        </div>
      )}

      <button
        onClick={toggle}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        aria-label={playing ? "Pausar" : "Tocar"}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="truncate font-medium">
            {row.edited.artist ? `${row.edited.artist} — ` : ""}
            {row.edited.title || row.fileName}
          </span>
        </div>
        {/* seek track with cue markers */}
        <div
          className="relative mt-1 h-3 cursor-pointer"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (dur > 0) seek(((e.clientX - r.left) / r.width) * dur);
          }}
        >
          <div className="absolute top-1 h-1 w-full rounded bg-border" />
          <div className="absolute top-1 h-1 rounded bg-primary" style={{ width: `${pct}%` }} />
          {cues.map((c, i) => (
            <span
              key={i}
              className="absolute top-0 h-3 w-0.5"
              style={{
                left: `${dur > 0 ? (c.positionSecs / dur) * 100 : 0}%`,
                backgroundColor: CUE_COLOR[c.kind],
              }}
              title={`${c.label} (${formatDuration(Math.round(c.positionSecs))})`}
            />
          ))}
        </div>
      </div>

      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
        {formatDuration(Math.round(current))} / {formatDuration(Math.round(dur))}
      </span>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-20 accent-primary"
        aria-label="Volume"
      />
    </div>
  );
}
