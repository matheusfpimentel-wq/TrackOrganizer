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

/** Parse an absolute path into Traktor LOCATION parts. */
function traktorLocation(path: string): { volume: string; dir: string; file: string; key: string } {
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  const file = parts.pop() ?? "";
  let volume = "";
  let dirParts = parts;
  if (/^[A-Za-z]:$/.test(parts[0] ?? "")) {
    volume = parts[0] as string; // Windows drive, e.g. "C:"
    dirParts = parts.slice(1);
  }
  const dir = `/:${dirParts.join("/:")}${dirParts.length ? "/:" : ""}`;
  return { volume, dir, file, key: `${volume}${dir}${file}` };
}

const TRAKTOR_CUE_TYPE: Record<Cue["kind"], number> = {
  intro: 0,
  build: 0,
  drop: 0,
  break: 0,
  outro: 0,
};

/**
 * Traktor collection NML with one playlist. Cues are exported as CUE_V2
 * (START in milliseconds). VOLUME is reliable on Windows (drive letter); on
 * macOS it is left blank and Traktor may need a one-time relocate.
 */
export function toTraktorNml(entries: SetlistEntry[], playlistName: string): string {
  const collection = entries
    .map(({ row, cues }) => {
      const t = row.edited;
      const loc = traktorLocation(row.filePath);
      const info = [
        t.genre ? `GENRE="${xmlEscape(t.genre)}"` : "",
        t.key ? `KEY="${xmlEscape(t.key)}"` : "",
        t.comment ? `COMMENT="${xmlEscape(t.comment)}"` : "",
        row.durationSecs != null ? `PLAYTIME="${Math.round(row.durationSecs)}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const tempo = t.bpm != null ? `\n      <TEMPO BPM="${t.bpm.toFixed(6)}" BPM_QUALITY="100.000000"></TEMPO>` : "";
      const cueXml = (cues ?? [])
        .slice(0, 8)
        .map(
          (c, i) =>
            `      <CUE_V2 NAME="${xmlEscape(c.label)}" DISPL_ORDER="${i}" TYPE="${TRAKTOR_CUE_TYPE[c.kind]}" START="${(c.positionSecs * 1000).toFixed(1)}" LEN="0.0" REPEATS="-1" HOTCUE="${i}"></CUE_V2>`,
        )
        .join("\n");
      return (
        `    <ENTRY MODIFIED_DATE="2026/1/1" TITLE="${xmlEscape(t.title)}" ARTIST="${xmlEscape(t.artist)}">\n` +
        `      <LOCATION DIR="${xmlEscape(loc.dir)}" FILE="${xmlEscape(loc.file)}" VOLUME="${xmlEscape(loc.volume)}"></LOCATION>` +
        (info ? `\n      <INFO ${info}></INFO>` : "") +
        tempo +
        (cueXml ? `\n${cueXml}` : "") +
        `\n    </ENTRY>`
      );
    })
    .join("\n");

  const playlistEntries = entries
    .map(({ row }) => {
      const key = traktorLocation(row.filePath).key;
      return `          <ENTRY><PRIMARYKEY TYPE="TRACK" KEY="${xmlEscape(key)}"></PRIMARYKEY></ENTRY>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<NML VERSION="19">
  <HEAD COMPANY="www.native-instruments.com" PROGRAM="Tracklistr"></HEAD>
  <COLLECTION ENTRIES="${entries.length}">
${collection}
  </COLLECTION>
  <PLAYLISTS>
    <NODE TYPE="FOLDER" NAME="$ROOT">
      <SUBNODES COUNT="1">
        <NODE TYPE="PLAYLIST" NAME="${xmlEscape(playlistName)}">
          <PLAYLIST ENTRIES="${entries.length}" TYPE="LIST">
${playlistEntries}
          </PLAYLIST>
        </NODE>
      </SUBNODES>
    </NODE>
  </PLAYLISTS>
</NML>
`;
}
