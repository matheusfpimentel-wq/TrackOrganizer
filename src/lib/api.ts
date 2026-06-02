import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ScannedTrack, TrackTags } from "@/types/track";
import { SAMPLE_TRACKS } from "@/lib/sampleData";

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
  return invoke<WriteOutcome>("write_tags", { items });
}
