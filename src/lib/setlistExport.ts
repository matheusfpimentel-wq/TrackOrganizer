import type { Cue, TrackRow } from "@/types/track";

/** Builders for setlist / playlist export formats. */

export interface SetlistEntry {
  row: TrackRow;
  /** Free-text transition note to the NEXT track. */
  note: string;
  /** Detected cue points (exported as rekordbox POSITION_MARK). */
  cues?: Cue[];
}

function label(row: TrackRow): string {
  const t = row.edited;
  if (t.artist && t.title) {
    return `${t.artist} - ${t.title}`;
  }
  return t.title || row.fileName;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Universal M3U8 playlist. Imports into Rekordbox, Serato and Traktor.
 * Uses absolute file paths so the DJ app can resolve the tracks.
 */
export function toM3u8(entries: SetlistEntry[]): string {
  const lines = ["#EXTM3U"];
  for (const { row } of entries) {
    lines.push(`#EXTINF:-1,${label(row)}`);
    lines.push(row.filePath);
  }
  return lines.join("\n") + "\n";
}

/** Human-readable show script with transition notes (.txt). */
export function toRoteiroTxt(entries: SetlistEntry[]): string {
  const lines: string[] = ["# Setlist — Tracklistr", ""];
  entries.forEach(({ row, note }, i) => {
    const t = row.edited;
    const meta = [t.bpm != null ? `${t.bpm} BPM` : "", t.key ? `Tom ${t.key}` : ""]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${i + 1}. ${label(row)}${meta ? `  [${meta}]` : ""}`);
    if (note.trim()) {
      lines.push(`   ↳ ${note.trim()}`);
    }
  });
  return lines.join("\n") + "\n";
}

/** Convert an absolute path to the rekordbox `Location` URI. */
function rekordboxLocation(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const encoded = withSlash
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://localhost${encoded}`;
}

/**
 * Rekordbox collection XML (DJ_PLAYLISTS) with a single playlist.
 * Import via Rekordbox → Preferences → Advanced → Database → rekordbox xml.
 */
export function toRekordboxXml(entries: SetlistEntry[], playlistName: string): string {
  const tracks = entries
    .map(({ row, cues }, i) => {
      const t = row.edited;
      const attrs = [
        `TrackID="${i + 1}"`,
        `Name="${xmlEscape(t.title)}"`,
        `Artist="${xmlEscape(t.artist)}"`,
        `Album="${xmlEscape(t.album)}"`,
        `Genre="${xmlEscape(t.genre)}"`,
        t.bpm != null ? `AverageBpm="${t.bpm}"` : "",
        t.year != null ? `Year="${t.year}"` : "",
        t.key ? `Tonality="${xmlEscape(t.key)}"` : "",
        t.comment ? `Comments="${xmlEscape(t.comment)}"` : "",
        `Location="${rekordboxLocation(row.filePath)}"`,
      ]
        .filter(Boolean)
        .join(" ");
      if (cues && cues.length > 0) {
        const marks = cues
          .map(
            (c) =>
              `        <POSITION_MARK Name="${xmlEscape(c.label)}" Type="0" Start="${c.positionSecs.toFixed(3)}" Num="-1"/>`,
          )
          .join("\n");
        return `      <TRACK ${attrs}>\n${marks}\n      </TRACK>`;
      }
      return `      <TRACK ${attrs}/>`;
    })
    .join("\n");

  const refs = entries.map((_, i) => `        <TRACK Key="${i + 1}"/>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="Tracklistr" Version="0.1.0" Company="Tracklistr"/>
  <COLLECTION Entries="${entries.length}">
${tracks}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${xmlEscape(playlistName)}" Type="1" KeyType="0" Entries="${entries.length}">
${refs}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;
}
