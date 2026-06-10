import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AiSuggestion,
  Cue,
  DeepScanResult,
  DupGroup,
  ScannedTrack,
  StructureResult,
  TrackTags,
} from "@/types/track";
import { mockAiSuggestions, SAMPLE_TRACKS } from "@/lib/sampleData";
import { downloadText } from "@/lib/export";

/** True when running inside the Tauri webview (vs. a plain browser tab). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** A URL the `<audio>` element can play for a local file (Tauri asset protocol). */
export function toPlayableSrc(path: string): string {
  return isTauri() ? convertFileSrc(path) : "";
}

/** Native folder picker. Returns the absolute path or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  // Browser dev fallback: no native dialog, return a stub path.
  if (!isTauri()) {
    return "/Music (amostra de desenvolvimento)";
  }
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

/** Native file picker with optional extension filters. */
export async function pickFile(
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (!isTauri()) {
    return "dev.xml";
  }
  const selected = await open(filters ? { multiple: false, filters } : { multiple: false });
  return typeof selected === "string" ? selected : null;
}

/** Import a rekordbox collection XML (reads referenced files from disk). */
export async function importRekordboxXml(path: string): Promise<ScannedTrack[]> {
  if (!isTauri()) {
    return SAMPLE_TRACKS;
  }
  return invoke<ScannedTrack[]>("import_rekordbox_xml", { path });
}

/** Import an M3U/M3U8 playlist. */
export async function importM3u(path: string): Promise<ScannedTrack[]> {
  if (!isTauri()) {
    return SAMPLE_TRACKS;
  }
  return invoke<ScannedTrack[]>("import_m3u", { path });
}

/** Scan a folder for audio files and read their tags (optionally recursive). */
export async function scanFolder(path: string, recursive: boolean): Promise<ScannedTrack[]> {
  // Browser dev fallback: serve sample data so the UI works without Tauri.
  if (!isTauri()) {
    return SAMPLE_TRACKS;
  }
  return invoke<ScannedTrack[]>("scan_folder", { path, recursive });
}

/**
 * Start a streaming + parallel scan. Returns the total file count immediately;
 * tracks arrive via `scan-batch` / `scan-done` events (see store.scan).
 */
export async function scanFolderStream(path: string, recursive: boolean): Promise<number> {
  return invoke<number>("scan_folder_stream", { path, recursive });
}

/** Re-read a single file's tags from disk. */
export async function readTags(path: string): Promise<TrackTags> {
  return invoke<TrackTags>("read_tags", { path });
}

/** First embedded artwork as a data URL (for thumbnails), or null. */
export async function getArtwork(path: string): Promise<string | null> {
  if (!isTauri()) {
    // Dev stub: a small colored tile so thumbnails are visible in the browser.
    const hue = Math.abs([...path].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><rect width='32' height='32' fill='hsl(${hue} 60% 45%)'/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  return invoke<string | null>("get_artwork", { path });
}

/** Reveal a file in the OS file manager (Finder / Explorer). */
export async function revealInFiles(path: string): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await invoke("reveal_in_files", { path });
}

/** Deep per-track audio analysis (spectral cutoff / fake-320 heuristic). */
export async function deepScan(path: string): Promise<DeepScanResult> {
  if (!isTauri()) {
    // Dev stub: flag bootleg/insomnia samples as suspect for demo purposes.
    const suspect = /bootleg|insomnia|bonbon-2/i.test(path);
    const cutoffHz = suspect ? 15500 : 20500;
    return {
      filePath: path,
      sampleRateHz: 44100,
      channels: 2,
      bitrateKbps: suspect ? 320 : 1411,
      cutoffHz,
      suspectTranscode: suspect,
      note: suspect
        ? `Corte em ~${(cutoffHz / 1000).toFixed(1)} kHz apesar de 320 kbps — provável transcode (fake).`
        : `Corte em ~${(cutoffHz / 1000).toFixed(1)} kHz — consistente.`,
    };
  }
  return invoke<DeepScanResult>("deep_scan", { path });
}

/** Cluster files that share the same audio via acoustic fingerprint. */
export async function findAudioDuplicates(paths: string[]): Promise<DupGroup[]> {
  if (!isTauri()) {
    // Dev stub: pair the two "bonbon" samples as the same audio.
    const bonbons = paths.filter((p) => /bonbon/i.test(p));
    return bonbons.length > 1 ? [{ files: bonbons, similarity: 0.97 }] : [];
  }
  return invoke<DupGroup[]>("find_audio_duplicates", { paths });
}

/** Detect structural cue points (intro / drops / breaks / outro) for a track. */
export async function detectCues(path: string): Promise<StructureResult> {
  if (!isTauri()) {
    // Dev stub: a build-up → drop → break → outro shape.
    const durationSecs = 212;
    const envelope = Array.from({ length: 240 }, (_, i) => {
      const t = i / 240;
      if (t < 0.06) return 0.15 + t;
      if (t < 0.28) return 0.35 + (t - 0.06) * 0.6;
      if (t < 0.55) return 0.9 + 0.1 * Math.sin(i);
      if (t < 0.62) return 0.25;
      if (t < 0.9) return 0.85 + 0.1 * Math.sin(i);
      return Math.max(0, 0.8 - (t - 0.9) * 6);
    });
    return {
      filePath: path,
      durationSecs,
      bpm: 124,
      envelope,
      cues: [
        { positionSecs: 6, label: "Início", kind: "intro" },
        { positionSecs: 18, label: "Build", kind: "build" },
        { positionSecs: 60, label: "Drop", kind: "drop" },
        { positionSecs: 118, label: "Quebra/Break", kind: "break" },
        { positionSecs: 132, label: "Drop", kind: "drop" },
        { positionSecs: 190, label: "Outro", kind: "outro" },
      ],
    };
  }
  return invoke<StructureResult>("detect_cues", { path });
}

/** Write cues into an MP3 as Serato Markers2 (returns the backup path). */
export async function writeSeratoCues(path: string, cues: Cue[]): Promise<string> {
  if (!isTauri()) {
    return "(dev) sem gravação no navegador";
  }
  return invoke<string>("write_serato_cues", { path, cues });
}

/** Export a Serato `.crate` playlist (native save dialog). Returns dest or null. */
export async function exportSeratoCrate(paths: string[]): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const dest = await save({
    defaultPath: "Tracklistr.crate",
    filters: [{ name: "Serato Crate", extensions: ["crate"] }],
  });
  if (!dest) {
    return null;
  }
  await invoke("export_serato_crate", { dest, paths });
  return dest;
}

export interface WriteRequest {
  filePath: string;
  tags: TrackTags;
}

export interface WriteResult {
  filePath: string;
  ok: boolean;
  error: string | null;
}

export interface WriteOutcome {
  backupPath: string;
  results: WriteResult[];
}

/**
 * Persist approved tags back to disk. The backend snapshots the originals to a
 * JSON backup first (for undo). Only call this after explicit user approval.
 */
export async function writeTags(items: WriteRequest[]): Promise<WriteOutcome> {
  // Browser dev fallback: pretend the write succeeded.
  if (!isTauri()) {
    return {
      backupPath: "(dev) sem backup no navegador",
      results: items.map((i) => ({ filePath: i.filePath, ok: true, error: null })),
    };
  }
  return invoke<WriteOutcome>("write_tags", { items });
}

/**
 * Save text to disk via the native save dialog (browser fallback: download).
 * Returns the chosen path, or null if cancelled.
 */
export async function saveTextFile(
  defaultName: string,
  content: string,
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (!isTauri()) {
    downloadText(defaultName, content);
    return defaultName;
  }
  const path = await save(filters ? { defaultPath: defaultName, filters } : { defaultPath: defaultName });
  if (!path) {
    return null;
  }
  await invoke("write_text_file", { path, content });
  return path;
}

/** Restore tags from a backup JSON (undo last write). */
export async function undoWrite(backupPath: string): Promise<WriteOutcome> {
  if (!isTauri()) {
    return { backupPath, results: [] };
  }
  return invoke<WriteOutcome>("undo_write", { backupPath });
}

// ---------------------------------------------------------------------------
// Local config (API key lives only in the backend; never returned to the UI)
// ---------------------------------------------------------------------------

export type AiProvider = "claude" | "ollama";

export interface PublicConfig {
  provider: AiProvider;
  model: string;
  charLimit: number;
  hasApiKey: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  genres: string[];
  genreStrict: boolean;
}

export interface ConfigPatch {
  provider?: AiProvider;
  model?: string;
  charLimit?: number;
  apiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  genres?: string[];
  genreStrict?: boolean;
}

const DEV_CONFIG: PublicConfig = {
  provider: "ollama",
  model: "claude-sonnet-4-6",
  charLimit: 50,
  hasApiKey: true,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",
  genres: [],
  genreStrict: false,
};

export async function getConfig(): Promise<PublicConfig> {
  if (!isTauri()) {
    return DEV_CONFIG;
  }
  return invoke<PublicConfig>("get_config");
}

export async function updateConfig(patch: ConfigPatch): Promise<PublicConfig> {
  if (!isTauri()) {
    const { apiKey: _apiKey, ...rest } = patch;
    return { ...DEV_CONFIG, ...rest, hasApiKey: true };
  }
  return invoke<PublicConfig>("update_config", patch as unknown as Record<string, unknown>);
}

export async function clearApiKey(): Promise<PublicConfig> {
  if (!isTauri()) {
    return { ...DEV_CONFIG, hasApiKey: false };
  }
  return invoke<PublicConfig>("clear_api_key");
}

// ---------------------------------------------------------------------------
// AI tagging
// ---------------------------------------------------------------------------

export interface AiTrackInput {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  comment: string;
  bpm: number | null;
  key: string;
  year: number | null;
  fileName: string;
}

export interface AiRequest {
  tracks: AiTrackInput[];
  fields: string[];
  charLimit: number;
}

/** Run one batch (≤ ~20 tracks) through the AI tagger. */
export async function tagWithAi(request: AiRequest): Promise<{ suggestions: AiSuggestion[] }> {
  if (!isTauri()) {
    return { suggestions: mockAiSuggestions(request.tracks, request.fields, request.charLimit) };
  }
  return invoke<{ suggestions: AiSuggestion[] }>("tag_with_ai", { request });
}
