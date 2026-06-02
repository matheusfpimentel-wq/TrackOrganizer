/**
 * Shared data model. Mirrors the Rust structs in `src-tauri/src/model.rs`
 * (serialized with `rename_all = "camelCase"`).
 */

/** The editable set of tags for a single track. */
export interface TrackTags {
  title: string;
  artist: string;
  album: string;
  genre: string;
  /** Beats per minute. Null when unknown / unparseable. */
  bpm: number | null;
  /** Musical key (Tom), e.g. "8A" / "Am". */
  key: string;
  year: number | null;
  /** Energy level 1..5 (deduced by AI later). Null when unset. */
  energy: number | null;
  comment: string;
}

/**
 * Lifecycle of a row, kept independent of the AI suggestions so original,
 * manual edits and AI proposals can coexist until explicit approval.
 */
export type TrackStatus =
  | "pristine" // untouched since scan
  | "pending_approval" // AI produced a suggestion awaiting user decision
  | "ready_to_write" // user approved / manually edited; differs from original
  | "writing" // write-back in progress
  | "error"; // read or write failed

export interface TrackRow {
  /** Stable id derived from the absolute path. */
  id: string;
  filePath: string;
  fileName: string;
  /** Container format: mp3, m4a, flac, wav, aiff, ... */
  format: string;
  hasArtwork: boolean;
  /** Snapshot from disk; used for diffing, undo and backup. */
  original: TrackTags;
  /** Working copy: manual edits land here. Starts equal to `original`. */
  edited: TrackTags;
  /** AI proposal (partial). Null until "Taggear com IA" runs. */
  suggested: Partial<TrackTags> | null;
  status: TrackStatus;
  /** Populated when status === "error". */
  error: string | null;
}

/** Raw record returned by the Rust `scan_folder` / `read_tags` commands. */
export interface ScannedTrack {
  id: string;
  filePath: string;
  fileName: string;
  format: string;
  hasArtwork: boolean;
  tags: TrackTags;
  /** Set when the file could not be parsed (corrupt / unsupported). */
  error: string | null;
}

/** Keys of the editable tag columns. */
export type TagKey = keyof TrackTags;

export interface ColumnDef {
  key: TagKey;
  label: string;
  type: "text" | "number";
  width: number;
}

/** Column order rendered in the grid (file name is appended read-only). */
export const COLUMNS: readonly ColumnDef[] = [
  { key: "title", label: "Título", type: "text", width: 240 },
  { key: "artist", label: "Artista", type: "text", width: 180 },
  { key: "album", label: "Álbum", type: "text", width: 160 },
  { key: "genre", label: "Gênero", type: "text", width: 150 },
  { key: "bpm", label: "BPM", type: "number", width: 70 },
  { key: "key", label: "Tom", type: "text", width: 70 },
  { key: "year", label: "Ano", type: "number", width: 70 },
  { key: "energy", label: "Energia", type: "number", width: 80 },
  { key: "comment", label: "Comentário", type: "text", width: 220 },
] as const;

/** Tag fields the AI is allowed to suggest. */
export const AI_FIELDS = ["title", "artist", "genre", "energy"] as const;
export type AiField = (typeof AI_FIELDS)[number];

/** AI proposal for one track (only requested fields populated). */
export interface AiSuggestion {
  id: string;
  title?: string;
  artist?: string;
  genre?: string;
  energy?: number;
}

/** Build an empty tag set. */
export function emptyTags(): TrackTags {
  return {
    title: "",
    artist: "",
    album: "",
    genre: "",
    bpm: null,
    key: "",
    year: null,
    energy: null,
    comment: "",
  };
}
