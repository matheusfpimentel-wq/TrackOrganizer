import type { TrackTags } from "@/types/track";

/**
 * Deterministic, offline helpers for name standardization. These are the
 * non-AI building blocks the curation engine will reuse later; the AI step
 * will refine genre/energy/title semantics on top of this cleanup.
 */

const JUNK_PATTERNS: RegExp[] = [
  /\[\s*free\s*download\s*\]/gi,
  /\(\s*free\s*download\s*\)/gi,
  /\[\s*official\s*(audio|video|music\s*video)?\s*\]/gi,
  /\bofficial\s*(audio|video|music\s*video)\b/gi,
  /\bHQ\b|\bHD\b/g,
  /www\.[^\s]+/gi,
  /\.(mp3|m4a|flac|wav|aiff?)\b/gi, // stray extension duplicated in title
];

/** Strip promotional junk, collapse whitespace and tidy separators. */
export function cleanText(value: string): string {
  let out = value;
  for (const re of JUNK_PATTERNS) {
    out = out.replace(re, " ");
  }
  return out
    .replace(/\s*_\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*-\s*$/g, "")
    .trim();
}

/**
 * Apply the canonical title format: `Título - Artista (Versão)`.
 * Version is any Remix/Edit/Bootleg/Mashup/VIP qualifier already extracted.
 */
export function formatTitle(parts: {
  title: string;
  artist: string;
  version?: string | undefined;
}): string {
  const title = cleanText(parts.title);
  const artist = cleanText(parts.artist);
  const version = parts.version ? cleanText(parts.version) : "";
  let out = artist ? `${title} - ${artist}` : title;
  if (version) {
    out += ` (${version})`;
  }
  return out;
}

/** Truncate to the configured Rekordbox-safe limit without cutting mid-word. */
export function applyCharLimit(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  const slice = value.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
}

/** Format seconds as m:ss (e.g. 214 -> "3:34"). */
export function formatDuration(secs: number | null): string {
  if (secs === null || secs <= 0) {
    return "";
  }
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Energy 1..5 as filled/empty dots (e.g. 3 -> "●●●○○"). */
export function energyDots(energy: number | null): string {
  if (energy === null || energy < 1) {
    return "";
  }
  const n = Math.min(5, Math.max(1, energy));
  return "●".repeat(n) + "○".repeat(5 - n);
}

const CAMELOT_RE = /^(1[0-2]|[1-9])([AB])$/i;

/** Background color (hsl) for a Camelot key code, or null if not Camelot. */
export function camelotColor(key: string): string | null {
  const m = key.trim().match(CAMELOT_RE);
  if (!m) {
    return null;
  }
  const num = Number.parseInt(m[1] as string, 10);
  // 12 hues around the wheel; A slightly darker than B.
  const hue = ((num - 1) / 12) * 360;
  const light = (m[2] as string).toUpperCase() === "A" ? 30 : 38;
  return `hsl(${hue} 55% ${light}%)`;
}

/** Format a single tag value for display in the grid / exports. */
export function displayValue(value: TrackTags[keyof TrackTags]): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
