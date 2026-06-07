use crate::model::{DeepScanResult, DupGroup};
use lofty::file::AudioFile;
use lofty::probe::Probe;
use rustfft::{num_complex::Complex, FftPlanner};
use std::f32::consts::PI;
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

const FFT_SIZE: usize = 4096;
/// How many seconds of audio to analyze (from the start).
const MAX_SECONDS: usize = 30;
/// Magnitude threshold (relative to peak) that still counts as "real" content.
const CUTOFF_REL: f64 = 0.005; // ~ -46 dB

/// Decode up to `MAX_SECONDS` of `path` to a mono f32 buffer + sample rate.
fn decode_mono(path: &str) -> Result<(Vec<f32>, u32, u32), String> {
    let file = File::open(path).map_err(|e| format!("abrir: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("probe: {e}"))?;
    let mut format = probed.format;
    let track = format.default_track().ok_or("sem trilha de áudio")?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(0);
    let channels = track.codec_params.channels.map(|c| c.count() as u32).unwrap_or(1);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("codec: {e}"))?;

    let max_samples = (sample_rate as usize).saturating_mul(MAX_SECONDS).max(FFT_SIZE * 8);
    let mut mono: Vec<f32> = Vec::with_capacity(max_samples.min(1 << 22));

    while mono.len() < max_samples {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(_) => break,
        };
        if packet.track_id() != track_id {
            continue;
        }
        let Ok(decoded) = decoder.decode(&packet) else {
            continue;
        };
        let spec = *decoded.spec();
        let ch = spec.channels.count().max(1);
        let mut sb = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        sb.copy_interleaved_ref(decoded);
        for frame in sb.samples().chunks(ch) {
            let sum: f32 = frame.iter().copied().sum();
            mono.push(sum / ch as f32);
        }
    }

    if sample_rate == 0 || mono.len() < FFT_SIZE {
        return Err("áudio curto demais ou ilegível para análise".into());
    }
    Ok((mono, sample_rate, channels))
}

/// Average magnitude spectrum → highest frequency bin with real energy (Hz).
fn spectral_cutoff(mono: &[f32], sample_rate: u32) -> u32 {
    let hann: Vec<f32> = (0..FFT_SIZE)
        .map(|i| 0.5 - 0.5 * ((2.0 * PI * i as f32) / (FFT_SIZE as f32 - 1.0)).cos())
        .collect();

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);

    let half = FFT_SIZE / 2;
    let mut avg = vec![0f64; half];
    let mut windows = 0usize;
    let mut pos = 0usize;
    while pos + FFT_SIZE <= mono.len() {
        let mut buf: Vec<Complex<f32>> = (0..FFT_SIZE)
            .map(|i| Complex { re: mono[pos + i] * hann[i], im: 0.0 })
            .collect();
        fft.process(&mut buf);
        for (i, slot) in avg.iter_mut().enumerate() {
            *slot += buf[i].norm() as f64;
        }
        windows += 1;
        pos += FFT_SIZE;
    }
    if windows == 0 {
        return 0;
    }
    for v in avg.iter_mut() {
        *v /= windows as f64;
    }

    let peak = avg.iter().copied().fold(0.0_f64, f64::max);
    if peak <= 0.0 {
        return 0;
    }
    let thresh = peak * CUTOFF_REL;
    let mut cutoff_bin = 0usize;
    for (i, &v) in avg.iter().enumerate() {
        if v > thresh {
            cutoff_bin = i;
        }
    }
    ((cutoff_bin as f64) * sample_rate as f64 / FFT_SIZE as f64).round() as u32
}

/// Run the per-track deep analysis (spectral cutoff + transcode heuristic).
pub fn analyze(path: &str) -> Result<DeepScanResult, String> {
    // Bitrate / lossless info from lofty.
    let (bitrate_kbps, lossless) = match Probe::open(path).and_then(|p| p.read()) {
        Ok(tagged) => {
            let props = tagged.properties();
            (props.audio_bitrate(), props.bit_depth().is_some())
        }
        Err(_) => (None, false),
    };

    let (mono, sample_rate, channels) = decode_mono(path)?;
    let cutoff_hz = spectral_cutoff(&mono, sample_rate);

    // Heuristic: high-bitrate or lossless files should keep energy past ~16 kHz.
    let claims_high = lossless || bitrate_kbps.map(|b| b >= 256).unwrap_or(false);
    let suspect_transcode = claims_high && cutoff_hz > 0 && cutoff_hz < 16_000;

    let note = if cutoff_hz == 0 {
        "Não foi possível medir o corte de frequência.".to_string()
    } else if suspect_transcode {
        format!(
            "Corte em ~{:.1} kHz apesar de {} — provável transcode (fake).",
            cutoff_hz as f64 / 1000.0,
            if lossless { "lossless".into() } else { format!("{} kbps", bitrate_kbps.unwrap_or(0)) }
        )
    } else {
        format!("Corte em ~{:.1} kHz — consistente.", cutoff_hz as f64 / 1000.0)
    };

    Ok(DeepScanResult {
        file_path: path.to_string(),
        sample_rate_hz: sample_rate,
        channels,
        bitrate_kbps,
        cutoff_hz,
        suspect_transcode,
        note,
    })
}

// ---------------------------------------------------------------------------
// Acoustic fingerprint (Haitsma-Kalker style) + duplicate clustering
// ---------------------------------------------------------------------------

const FP_FFT: usize = 4096;
const FP_BANDS: usize = 33; // 33 bands -> 32 bits per sub-fingerprint
const FP_MIN_HZ: f32 = 300.0;
const FP_MAX_HZ: f32 = 2000.0;
/// Min similarity (1 - bit error rate) to consider two tracks the same audio.
const DUP_THRESHOLD: f32 = 0.80;

/// Log-spaced FFT-bin edges for the 33 bands (length 34).
fn band_edges(sample_rate: u32) -> [usize; FP_BANDS + 1] {
    let mut edges = [0usize; FP_BANDS + 1];
    let ratio = FP_MAX_HZ / FP_MIN_HZ;
    for (i, edge) in edges.iter_mut().enumerate() {
        let f = FP_MIN_HZ * ratio.powf(i as f32 / FP_BANDS as f32);
        let bin = (f * FP_FFT as f32 / sample_rate as f32).round() as usize;
        *edge = bin.min(FP_FFT / 2 - 1);
    }
    edges
}

/// Compute the sub-fingerprint sequence (one u32 per frame) for a file.
pub fn fingerprint(path: &str) -> Result<Vec<u32>, String> {
    let (mono, sample_rate, _ch) = decode_mono(path)?;
    let edges = band_edges(sample_rate);

    let hann: Vec<f32> = (0..FP_FFT)
        .map(|i| 0.5 - 0.5 * ((2.0 * PI * i as f32) / (FP_FFT as f32 - 1.0)).cos())
        .collect();
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FP_FFT);
    let hop = FP_FFT / 2;

    // Per-frame band energies.
    let mut frames: Vec<[f64; FP_BANDS]> = Vec::new();
    let mut pos = 0usize;
    while pos + FP_FFT <= mono.len() {
        let mut buf: Vec<Complex<f32>> = (0..FP_FFT)
            .map(|i| Complex { re: mono[pos + i] * hann[i], im: 0.0 })
            .collect();
        fft.process(&mut buf);
        let mut bands = [0f64; FP_BANDS];
        for (m, band) in bands.iter_mut().enumerate() {
            let lo = edges[m];
            let hi = edges[m + 1].max(lo + 1);
            let mut e = 0f64;
            for c in &buf[lo..hi] {
                let mag = c.norm() as f64;
                e += mag * mag;
            }
            *band = e;
        }
        frames.push(bands);
        pos += hop;
    }

    // Sub-fingerprints: sign of the second difference (time × band).
    let mut fp = Vec::with_capacity(frames.len().saturating_sub(1));
    for n in 1..frames.len() {
        let cur = &frames[n];
        let prev = &frames[n - 1];
        let mut bits = 0u32;
        for m in 0..(FP_BANDS - 1) {
            let d = (cur[m] - cur[m + 1]) - (prev[m] - prev[m + 1]);
            if d > 0.0 {
                bits |= 1 << m;
            }
        }
        fp.push(bits);
    }
    Ok(fp)
}

/// Best similarity (1 - min bit-error-rate) between two fingerprint sequences,
/// searching a small alignment offset.
fn similarity(a: &[u32], b: &[u32]) -> f32 {
    const MAX_OFFSET: isize = 80;
    const MIN_OVERLAP: u64 = 50;
    let mut best = 1.0f32;
    let mut matched = false;
    for off in -MAX_OFFSET..=MAX_OFFSET {
        let mut bits = 0u64;
        let mut cnt = 0u64;
        for (i, &av) in a.iter().enumerate() {
            let j = i as isize + off;
            if j < 0 || j as usize >= b.len() {
                continue;
            }
            bits += (av ^ b[j as usize]).count_ones() as u64;
            cnt += 1;
        }
        if cnt >= MIN_OVERLAP {
            matched = true;
            let e = bits as f32 / (cnt as f32 * 32.0);
            if e < best {
                best = e;
            }
        }
    }
    if matched {
        1.0 - best
    } else {
        0.0
    }
}

/// Fingerprint each path and cluster files that share the same audio.
pub fn find_audio_duplicates(paths: &[String]) -> Result<Vec<DupGroup>, String> {
    let prints: Vec<(String, Vec<u32>)> = paths
        .iter()
        .filter_map(|p| fingerprint(p).ok().map(|fp| (p.clone(), fp)))
        .filter(|(_, fp)| fp.len() as u64 >= 50)
        .collect();

    let n = prints.len();
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(parent: &mut [usize], x: usize) -> usize {
        let mut r = x;
        while parent[r] != r {
            r = parent[r];
        }
        let mut c = x;
        while parent[c] != r {
            let next = parent[c];
            parent[c] = r;
            c = next;
        }
        r
    }

    // Track the minimum pairwise similarity within each merged pair.
    let mut best_sim = vec![0f32; n];
    for i in 0..n {
        for j in (i + 1)..n {
            let sim = similarity(&prints[i].1, &prints[j].1);
            if sim >= DUP_THRESHOLD {
                let ri = find(&mut parent, i);
                let rj = find(&mut parent, j);
                if ri != rj {
                    parent[ri] = rj;
                }
                best_sim[i] = best_sim[i].max(sim);
                best_sim[j] = best_sim[j].max(sim);
            }
        }
    }

    let mut groups: std::collections::HashMap<usize, (Vec<String>, f32)> = std::collections::HashMap::new();
    for i in 0..n {
        let root = find(&mut parent, i);
        let entry = groups.entry(root).or_insert_with(|| (Vec::new(), 0.0));
        entry.0.push(prints[i].0.clone());
        entry.1 = entry.1.max(best_sim[i]);
    }

    let mut out: Vec<DupGroup> = groups
        .into_values()
        .filter(|(files, _)| files.len() > 1)
        .map(|(files, similarity)| DupGroup { files, similarity })
        .collect();
    out.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
    Ok(out)
}
