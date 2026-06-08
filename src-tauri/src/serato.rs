use crate::model::Cue;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lofty::config::{ParseOptions, WriteOptions};
use lofty::file::AudioFile;
use lofty::flac::FlacFile;
use lofty::id3::v2::{BinaryFrame, Frame, FrameId, Id3v2Tag};
use lofty::mpeg::MpegFile;
use lofty::ogg::VorbisComments;
use std::borrow::Cow;
use std::io::BufReader;
use std::path::Path;

const FLAC_MARKERS_KEY: &str = "SERATO_MARKERS_V2";

const MARKERS2_DESC: &str = "Serato Markers2";

fn u16be(v: u16) -> [u8; 2] {
    v.to_be_bytes()
}
fn u32be(v: u32) -> [u8; 4] {
    v.to_be_bytes()
}

/// Cue colour (RGB) by kind — mirrors the UI palette.
fn color_for(kind: &str) -> [u8; 3] {
    match kind {
        "intro" => [0x1f, 0xc8, 0x7a],
        "build" => [0xf2, 0xa0, 0x2c],
        "drop" => [0xe0, 0x3a, 0x3a],
        "break" => [0x2a, 0xa6, 0xe6],
        _ => [0x9a, 0x9a, 0x9a],
    }
}

/// Encode the (base64-decoded) Serato Markers2 envelope from cues (max 8 hot cues).
pub fn encode_markers2(cues: &[Cue]) -> Vec<u8> {
    let mut env = vec![0x01, 0x01];
    for (i, c) in cues.iter().take(8).enumerate() {
        let mut body: Vec<u8> = Vec::new();
        body.push(0x00);
        body.extend(u16be(i as u16));
        body.extend(u32be((c.position_secs.max(0.0) * 1000.0) as u32));
        body.push(0x00);
        body.extend(color_for(&c.kind));
        body.push(0x00);
        body.push(0x00);
        body.extend(c.label.as_bytes());
        body.push(0x00);

        env.extend_from_slice(b"CUE\x00");
        env.extend(u32be(body.len() as u32));
        env.extend(body);
    }
    env.push(0x00); // empty-name entry → terminator
    env
}

/// The Serato Markers2 "object": version `01 01` + base64(envelope).
/// This is what MP4/FLAC store (base64'd again); MP3 wraps it in a GEOB frame.
fn build_markers2_object(cues: &[Cue]) -> Vec<u8> {
    let envelope = encode_markers2(cues);
    let b64 = STANDARD.encode(&envelope);
    let mut object: Vec<u8> = vec![0x01, 0x01];
    object.extend_from_slice(b64.as_bytes());
    object
}

/// Build the full GEOB frame content for a "Serato Markers2" frame (MP3).
fn build_markers2_geob(cues: &[Cue]) -> Vec<u8> {
    let mut data: Vec<u8> = Vec::new();
    data.push(0x00); // text encoding: ISO-8859-1
    data.extend_from_slice(b"application/octet-stream\x00"); // MIME
    data.push(0x00); // filename (empty)
    data.extend_from_slice(b"Serato Markers2\x00"); // content description
    data.extend(build_markers2_object(cues));
    data
}

fn is_markers2(frame: &Frame<'_>) -> bool {
    if let Frame::Binary(b) = frame {
        if b.id().as_str() == "GEOB" {
            return b
                .data
                .windows(MARKERS2_DESC.len())
                .any(|w| w == MARKERS2_DESC.as_bytes());
        }
    }
    false
}

/// Write cues into an MP3 as a Serato Markers2 GEOB frame, preserving any other
/// Serato GEOB frames (BeatGrid/Overview). MP3 only for now.
pub fn write_serato_cues(path: &str, cues: &[Cue]) -> Result<(), String> {
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "mp3" => write_mp3(path, cues),
        "flac" => write_flac(path, cues),
        _ => Err("Cues do Serato por enquanto só em MP3 e FLAC.".into()),
    }
}

fn write_mp3(path: &str, cues: &[Cue]) -> Result<(), String> {
    let file = std::fs::File::open(path).map_err(|e| format!("abrir MP3: {e}"))?;
    let mut mpeg = MpegFile::read_from(&mut BufReader::new(file), ParseOptions::new())
        .map_err(|e| format!("ler MP3: {e}"))?;
    if mpeg.id3v2().is_none() {
        mpeg.set_id3v2(Id3v2Tag::new());
    }
    let tag = mpeg.id3v2_mut().expect("id3v2 present");

    // Drop only the existing Serato Markers2 frame; keep other GEOB frames.
    tag.retain(|f| !is_markers2(f));

    let data = build_markers2_geob(cues);
    tag.insert(Frame::Binary(BinaryFrame::new(FrameId::Valid(Cow::Borrowed("GEOB")), data)));

    mpeg.save_to_path(path, WriteOptions::default()).map_err(|e| format!("gravar: {e}"))
}

fn write_flac(path: &str, cues: &[Cue]) -> Result<(), String> {
    let file = std::fs::File::open(path).map_err(|e| format!("abrir FLAC: {e}"))?;
    let mut flac = FlacFile::read_from(&mut BufReader::new(file), ParseOptions::new())
        .map_err(|e| format!("ler FLAC: {e}"))?;
    if flac.vorbis_comments().is_none() {
        flac.set_vorbis_comments(VorbisComments::new());
    }
    let vc = flac.vorbis_comments_mut().expect("vorbis comments present");

    // Serato stores the object base64'd again inside a Vorbis comment.
    let _: Vec<String> = vc.remove(FLAC_MARKERS_KEY).collect();
    let value = STANDARD.encode(build_markers2_object(cues));
    vc.insert(FLAC_MARKERS_KEY.to_string(), value);

    flac.save_to_path(path, WriteOptions::default()).map_err(|e| format!("gravar: {e}"))
}

// ---------------------------------------------------------------------------
// .crate playlist export
// ---------------------------------------------------------------------------

fn utf16be(s: &str) -> Vec<u8> {
    s.encode_utf16().flat_map(|u| u.to_be_bytes()).collect()
}

fn crate_field(tag: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let mut v = tag.to_vec();
    v.extend((body.len() as u32).to_be_bytes());
    v.extend_from_slice(body);
    v
}

/// Serato stores track paths relative to the volume root (no leading slash).
fn crate_rel_path(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    normalized.strip_prefix('/').unwrap_or(&normalized).to_string()
}

/// Build a Serato `.crate` file from a list of absolute track paths.
pub fn build_crate(paths: &[String]) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    out.extend(crate_field(b"vrsn", &utf16be("1.0/Serato ScratchLive Crate")));
    for p in paths {
        let ptrk = crate_field(b"ptrk", &utf16be(&crate_rel_path(p)));
        out.extend(crate_field(b"otrk", &ptrk));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cue(pos: f32, label: &str, kind: &str) -> Cue {
        Cue { position_secs: pos, label: label.to_string(), kind: kind.to_string() }
    }

    /// Decode the Markers2 envelope back to (index, position_ms, name) for verification.
    fn decode(env: &[u8]) -> Vec<(u16, u32, String)> {
        let mut out = Vec::new();
        let mut i = 2; // skip version
        while i < env.len() {
            let start = i;
            while i < env.len() && env[i] != 0 {
                i += 1;
            }
            let name = String::from_utf8_lossy(&env[start..i]).to_string();
            i += 1; // null
            if name.is_empty() {
                break;
            }
            let len = u32::from_be_bytes([env[i], env[i + 1], env[i + 2], env[i + 3]]) as usize;
            i += 4;
            let body = &env[i..i + len];
            i += len;
            if name == "CUE" {
                let index = u16::from_be_bytes([body[1], body[2]]);
                let pos = u32::from_be_bytes([body[3], body[4], body[5], body[6]]);
                let nstart = 13;
                let nend = body[nstart..].iter().position(|&b| b == 0).map(|p| nstart + p).unwrap_or(body.len());
                let label = String::from_utf8_lossy(&body[nstart..nend]).to_string();
                out.push((index, pos, label));
            }
        }
        out
    }

    #[test]
    fn markers2_roundtrip() {
        let cues = vec![
            cue(6.0, "Início", "intro"),
            cue(60.5, "Drop", "drop"),
            cue(190.0, "Outro", "outro"),
        ];
        let env = encode_markers2(&cues);
        let decoded = decode(&env);
        assert_eq!(decoded.len(), 3);
        assert_eq!(decoded[0], (0, 6000, "Início".to_string()));
        assert_eq!(decoded[1], (1, 60500, "Drop".to_string()));
        assert_eq!(decoded[2], (2, 190000, "Outro".to_string()));
    }

    #[test]
    fn flac_object_roundtrip() {
        let cues = vec![cue(6.0, "Início", "intro"), cue(60.5, "Drop", "drop")];
        // FLAC stores base64(object); object = 01 01 + base64(envelope).
        let value = STANDARD.encode(build_markers2_object(&cues));
        let object = STANDARD.decode(value).unwrap();
        assert_eq!(&object[0..2], &[0x01, 0x01]);
        let envelope = STANDARD.decode(&object[2..]).unwrap();
        let decoded = decode(&envelope);
        assert_eq!(decoded.len(), 2);
        assert_eq!(decoded[1], (1, 60500, "Drop".to_string()));
    }

    #[test]
    fn crate_has_tracks() {
        let bytes = build_crate(&["/Users/dj/Music/a.mp3".to_string()]);
        assert_eq!(&bytes[0..4], b"vrsn");
        assert!(bytes.windows(4).any(|w| w == b"otrk"));
        assert!(bytes.windows(4).any(|w| w == b"ptrk"));
    }
}
