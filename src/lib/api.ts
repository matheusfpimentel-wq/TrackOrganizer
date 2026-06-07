import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AiSuggestion, DeepScanResult, ScannedTrack, TrackTags } from "@/types/track";
import { mockAiSuggestions, SAMPLE_TRACKS } from "@/lib/sampleData";
import { downloadText } from "@/lib/export";

/** True when running inside the Tauri webview (vs. a plain browser tab). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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

/** Recursively scan a folder for audio files and read their tags. */
export async function scanFolder(path: string): Promise<ScannedTrack[]> {
  // Browser dev fallback: serve sample data so the UI works without Tauri.
  if (!isTauri()) {
    return SAMPLE_TRACKS;
  }
  return invoke<ScannedTrack[]>("scan_folder", { path });
}

/** Re-read a single file's tags from disk. */
export async function readTags(path: string): Promise<TrackTags> {
  return invoke<TrackTags>("read_tags", { path });
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
  provider: "claude",
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
