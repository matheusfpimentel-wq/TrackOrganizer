use crate::model::DeepScanResult;
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
