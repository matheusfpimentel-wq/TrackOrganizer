import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AiSuggestion, ScannedTrack, TrackTags } from "@/types/track";
import { mockAiSuggestions, SAMPLE_TRACKS } from "@/lib/sampleData";

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
