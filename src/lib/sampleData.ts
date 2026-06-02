import type { AiSuggestion, ScannedTrack } from "@/types/track";
import { applyCharLimit, cleanText, formatTitle } from "@/lib/format";

/**
 * Sample library used only when running outside Tauri (`npm run dev` in a plain
 * browser), so the UI can be developed without the native backend. The real
 * data path always goes through the Rust `scan_folder` command.
 */
export const SAMPLE_TRACKS: ScannedTrack[] = [
  {
    id: "sample-0001",
    filePath: "/Music/Reggaeton/safaera.mp3",
    fileName: "safaera.mp3",
    format: "mp3",
    hasArtwork: true,
    error: null,
    tags: {
      title: "Safaera [Free Download]",
      artist: "Bad Bunny, Jowell & Randy, Ñengo Flow",
      album: "YHLQMDLG",
      genre: "Latin",
      bpm: 92,
      key: "8A",
      year: 2020,
      energy: null,
      comment: "",
    },
  },
  {
    id: "sample-0002",
    filePath: "/Music/Reggaeton/titi-me-pregunto.flac",
    fileName: "titi-me-pregunto.flac",
    format: "flac",
    hasArtwork: true,
    error: null,
    tags: {
      title: "Tití Me Preguntó",
      artist: "Bad Bunny",
      album: "Un Verano Sin Ti",
      genre: "",
      bpm: 106,
      key: "11A",
      year: 2022,
      energy: null,
      comment: "",
    },
  },
  {
    id: "sample-0003",
    filePath: "/Music/Edits/get-lucky-disclosure.mp3",
    fileName: "get-lucky-disclosure.mp3",
    format: "mp3",
    hasArtwork: false,
    error: null,
    tags: {
      title: "Get Lucky (Disclosure Remix)",
      artist: "Daft Punk",
      album: "",
      genre: "Disco",
      bpm: 124,
      key: "4A",
      year: 2013,
      energy: null,
      comment: "",
    },
  },
  {
    id: "sample-0004",
    filePath: "/Music/Funk/automotivo-bibi.wav",
    fileName: "automotivo-bibi.wav",
    format: "wav",
    hasArtwork: false,
    error: null,
    tags: {
      title: "Automotivo Bibi Fogosa",
      artist: "Bibi Babydoll",
      album: "",
      genre: "Brazilian",
      bpm: 130,
      key: "1A",
      year: 2023,
      energy: null,
      comment: "",
    },
  },
  {
    id: "sample-0005",
    filePath: "/Music/Guaracha/la-fiesta.m4a",
    fileName: "la-fiesta.m4a",
    format: "m4a",
    hasArtwork: true,
    error: null,
    tags: {
      title: "La Fiesta (Aleteo Edit)",
      artist: "DJ Tiesto",
      album: "",
      genre: "",
      bpm: 128,
      key: "9A",
      year: 2021,
      energy: null,
      comment: "",
    },
  },
  {
    id: "sample-0006",
    filePath: "/Music/Dembow/bonbon.mp3",
    fileName: "bonbon.mp3",
    format: "mp3",
    hasArtwork: true,
    error: null,
    tags: {
      title: "Bonbon",
      artist: "El Alfa",
      album: "El Hombre",
      genre: "Latin",
      bpm: 115,
      key: "7A",
      year: 2019,
      energy: null,
      comment: "",
    },
  },
  {
    id: "sample-0007",
    filePath: "/Music/House/insomnia-bootleg.mp3",
    fileName: "insomnia-bootleg.mp3",
    format: "mp3",
    hasArtwork: false,
    error: null,
    tags: {
      title: "Insomnia (Tech House Bootleg) www.djblog.com",
      artist: "Faithless",
      album: "",
      genre: "Trance",
      bpm: 126,
      key: "5A",
      year: 2024,
      energy: null,
      comment: "",
    },
  },
  {
    // Duplicate of sample-0006 (same title+artist, different file) + bad year.
    id: "sample-0009",
    filePath: "/Music/Dembow/bonbon-2.mp3",
    fileName: "bonbon-2.mp3",
    format: "mp3",
    hasArtwork: false,
    error: null,
    tags: {
      title: "Bonbon",
      artist: "El Alfa",
      album: "",
      genre: "Latin",
      bpm: 115,
      key: "7A",
      year: 1899,
      energy: null,
      comment: "",
    },
  },
  {
    id: "sample-0008",
    filePath: "/Music/Corrupt/broken-file.mp3",
    fileName: "broken-file.mp3",
    format: "mp3",
    hasArtwork: false,
    error: "read: invalid frame header",
    tags: {
      title: "",
      artist: "",
      album: "",
      genre: "",
      bpm: null,
      key: "",
      year: null,
      energy: null,
      comment: "",
    },
  },
];

interface MockInput {
  id: string;
  title: string;
  artist: string;
  genre: string;
  fileName: string;
  bpm: number | null;
}

/** Detect a Remix/Edit/Bootleg/etc. qualifier from the title. */
function detectVersion(title: string): string | undefined {
  const m = title.match(/[([]([^()[\]]*(remix|edit|bootleg|mashup|vip|version|club)[^()[\]]*)[)\]]/i);
  return m?.[1]?.trim();
}

function guessGenre(haystack: string, current: string): string {
  const h = haystack.toLowerCase();
  if (/(bootleg|tech\s*house|insomnia)/.test(h)) return "Tech House";
  if (/(disclosure|uk garage)/.test(h)) return "UK Garage";
  if (/(guaracha|aleteo)/.test(h)) return "Guaracha";
  if (/(dembow|el alfa|bonbon)/.test(h)) return "Dembow";
  if (/(automotivo|mandel|funk|bibi)/.test(h)) return "Funk Mandelão";
  if (/(reggaeton|bad bunny|titi|safaera|preguntó|pregunto)/.test(h)) return "Reggaeton Portorriquenho";
  return current.trim() || "Reggaeton";
}

function guessEnergy(bpm: number | null): number {
  if (bpm === null) return 3;
  if (bpm >= 124) return 5;
  if (bpm >= 108) return 4;
  return 3;
}

/**
 * Heuristic stand-in for the Claude tagger, used only in the browser dev
 * fallback. The real suggestions come from the Rust `tag_with_ai` command.
 */
export function mockAiSuggestions(
  tracks: MockInput[],
  fields: string[],
  charLimit: number,
): AiSuggestion[] {
  return tracks.map((t) => {
    const version = detectVersion(t.title);
    const s: AiSuggestion = { id: t.id };
    if (fields.includes("genre")) {
      s.genre = guessGenre(`${t.title} ${t.artist} ${t.fileName} ${t.genre}`, t.genre);
    }
    if (fields.includes("artist")) {
      s.artist = cleanText(t.artist.replace(/\s*(feat\.?|ft\.?|con)\s.+$/i, ""));
    }
    if (fields.includes("title")) {
      const cleanTitle = cleanText(t.title.replace(/[([][^()[\]]*(remix|edit|bootleg|mashup|vip|version|club)[^()[\]]*[)\]]/i, ""));
      const artist = cleanText(t.artist.replace(/\s*(feat\.?|ft\.?|con)\s.+$/i, ""));
      s.title = applyCharLimit(formatTitle({ title: cleanTitle, artist, version }), charLimit);
    }
    if (fields.includes("energy")) {
      s.energy = guessEnergy(t.bpm);
    }
    return s;
  });
}
