use anyhow::{Context, Result};
use std::path::Path;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::process::Command;
use tracing::{info, warn};

/// Detect available hardware acceleration codec
/// Returns the codec name if available, None otherwise
/// Cached after first detection
static HARDWARE_CODEC: Mutex<Option<Option<String>>> = Mutex::new(None);

pub async fn detect_hardware_codec() -> Option<String> {
    // Check cache first
    {
        let cache = HARDWARE_CODEC.lock().unwrap();
        if let Some(ref codec) = *cache {
            return codec.clone();
        }
    }
    
    // Detect and cache
    let codec = detect_hardware_codec_impl().await;
    {
        let mut cache = HARDWARE_CODEC.lock().unwrap();
        *cache = Some(codec.clone());
    }
    codec
}

async fn detect_hardware_codec_impl() -> Option<String> {
    // Check for available hardware encoders
    let output = match Command::new("ffmpeg")
        .arg("-hide_banner")
        .arg("-encoders")
        .output()
        .await
    {
        Ok(output) => output,
        Err(_) => return None,
    };

    let encoders_output = format!("{}{}", 
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    // Check for hardware encoders in order of preference
    if encoders_output.contains("h264_videotoolbox") {
        info!("[ffmpeg] ✅ Hardware acceleration detected: VideoToolbox (macOS)");
        Some("h264_videotoolbox".to_string())
    } else if encoders_output.contains("h264_nvenc") {
        info!("[ffmpeg] ✅ Hardware acceleration detected: NVENC (NVIDIA)");
        Some("h264_nvenc".to_string())
    } else if encoders_output.contains("h264_qsv") {
        info!("[ffmpeg] ✅ Hardware acceleration detected: Quick Sync Video (Intel)");
        Some("h264_qsv".to_string())
    } else if encoders_output.contains("h264_amf") {
        info!("[ffmpeg] ✅ Hardware acceleration detected: AMF (AMD)");
        Some("h264_amf".to_string())
    } else {
        warn!("[ffmpeg] ⚠️  No hardware acceleration found, using CPU encoding");
        None
    }
}

/// Get video duration using ffprobe
pub async fn get_video_duration<P: AsRef<Path>>(file_path: P) -> Result<f64> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(file_path.as_ref())
        .output()
        .await
        .context("Failed to execute ffprobe")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffprobe failed: {}", stderr);
    }

    let duration_str = String::from_utf8_lossy(&output.stdout);
    let duration = duration_str
        .trim()
        .parse::<f64>()
        .context("Failed to parse duration")?;

    Ok(duration)
}

/// Generate a single clip from video (optimized for speed)
pub async fn generate_clip(
    input_path: &Path,
    output_path: &Path,
    start_time: f64,
    duration: f64,
    ffmpeg_config: &crate::config::FfmpegConfig,
    concurrent_clips: usize,
) -> Result<()> {
    // Optimize thread allocation based on concurrent processing
    // When fewer clips run concurrently, each can use more threads
    let threads = ffmpeg_config.threads_per_clip.unwrap_or_else(|| {
        let cpu_count = num_cpus::get();
        let advanced = ffmpeg_config.advanced.as_ref();
        // Distribute threads more efficiently: use more threads when fewer clips run concurrently
        let threads_per_clip = if concurrent_clips <= 2 {
            // If only 1-2 clips, use more threads each
            let min = advanced.map(|a| a.threads_when_1_2_clips_min).unwrap_or(2);
            let max = advanced.map(|a| a.threads_when_1_2_clips_max).unwrap_or(6);
            (cpu_count / concurrent_clips.max(1)).max(min).min(max)
        } else if concurrent_clips <= 4 {
            // If 3-4 clips, use moderate threads
            let min = advanced.map(|a| a.threads_when_3_4_clips_min).unwrap_or(1);
            let max = advanced.map(|a| a.threads_when_3_4_clips_max).unwrap_or(4);
            (cpu_count / concurrent_clips.max(1)).max(min).min(max)
        } else {
            // If many clips, use fewer threads each to avoid oversubscription
            let min = advanced.map(|a| a.threads_when_many_clips_min).unwrap_or(1);
            let max = advanced.map(|a| a.threads_when_many_clips_max).unwrap_or(2);
            (cpu_count / concurrent_clips.max(1)).max(min).min(max)
        };
        threads_per_clip
    });
    
    let mut cmd = Command::new("ffmpeg");
    
    // Input seeking: use input seeking if configured (faster)
    if ffmpeg_config.use_input_seeking {
        cmd.arg("-ss").arg(start_time.to_string());
    }
    
    // Input options for better performance
    let advanced = ffmpeg_config.advanced.as_ref();
    let thread_queue_size = advanced.map(|a| a.thread_queue_size).unwrap_or(512);
    cmd.arg("-thread_queue_size").arg(thread_queue_size.to_string());
    
    cmd.arg("-i").arg(input_path);
    
    // Output seeking: use if not using input seeking
    if !ffmpeg_config.use_input_seeking {
        cmd.arg("-ss").arg(start_time.to_string());
    }
    
    // Duration
    cmd.arg("-t").arg(duration.to_string());
    
    // Video codec settings - try hardware acceleration first
    let advanced = ffmpeg_config.advanced.as_ref();
    let default_codec = advanced.map(|a| a.default_video_codec.clone()).unwrap_or_else(|| "libx264".to_string());
    let video_codec = detect_hardware_codec().await.unwrap_or_else(|| default_codec);
    cmd.arg("-c:v").arg(&video_codec);
    
    if video_codec == "libx264" {
        // CPU encoding settings
        cmd.arg("-preset").arg(&ffmpeg_config.preset);
        cmd.arg("-crf").arg(ffmpeg_config.crf.to_string());
        cmd.arg("-profile:v").arg(&ffmpeg_config.profile);
        cmd.arg("-level").arg(&ffmpeg_config.level);
        cmd.arg("-threads").arg(threads.to_string());
    } else {
        // Hardware encoding settings (simpler, hardware handles most settings)
        // For VideoToolbox on macOS, use quality-based encoding
        if let Some(adv) = advanced {
            if video_codec == "h264_videotoolbox" {
                // VideoToolbox uses -b:v (bitrate) or -allow_sw 1 for software fallback
                // Quality setting: 0-100, higher = better quality
                let quality = (adv.videotoolbox_quality_max as f64 - (ffmpeg_config.crf as f64 * adv.videotoolbox_crf_multiplier))
                    .max(adv.videotoolbox_quality_min as f64)
                    .min(adv.videotoolbox_quality_max as f64) as u8;
                cmd.arg("-quality").arg(quality.to_string());
                cmd.arg("-allow_sw").arg("1"); // Allow software fallback if needed
            } else if video_codec == "h264_nvenc" {
                // NVENC preset
                cmd.arg("-preset").arg(&adv.nvenc_preset);
                cmd.arg("-rc").arg(&adv.nvenc_rc);
                cmd.arg("-cq").arg(ffmpeg_config.crf.to_string());
            } else if video_codec == "h264_qsv" {
                // Quick Sync settings
                cmd.arg("-preset").arg(&adv.qsv_preset);
                cmd.arg("-global_quality").arg(ffmpeg_config.crf.to_string());
            } else if video_codec == "h264_amf" {
                // AMD AMF settings
                cmd.arg("-quality").arg(&adv.amf_quality);
                cmd.arg("-rc").arg(&adv.amf_rc);
            }
        }
    }
    
    // Performance optimizations: buffer settings for faster encoding
    // Optimized for speed over quality when processing large videos
    let advanced = ffmpeg_config.advanced.as_ref();
    if let Some(adv) = advanced {
        cmd.arg("-bufsize").arg(&adv.bufsize);
        cmd.arg("-maxrate").arg(&adv.maxrate);
        cmd.arg("-g").arg(adv.gop_size.to_string());
        cmd.arg("-keyint_min").arg(adv.keyint_min.to_string());
    } else {
        // Fallback defaults
        cmd.arg("-bufsize").arg("1M");
        cmd.arg("-maxrate").arg("4M");
        cmd.arg("-g").arg("30");
        cmd.arg("-keyint_min").arg("30");
    }
    
    // Tune settings - filter out unsupported options for hardware encoders
    // NVENC doesn't support "zerolatency" and "fastdecode" tune options
    if video_codec == "libx264" {
        // CPU encoding supports all tune options
        for tune in &ffmpeg_config.tune {
            cmd.arg("-tune").arg(tune);
        }
    } else {
        // Hardware encoders have limited tune support
        // Only include tune options that are compatible with hardware encoders
        for tune in &ffmpeg_config.tune {
            // Skip tune options not supported by hardware encoders
            if tune != "zerolatency" && tune != "fastdecode" {
                cmd.arg("-tune").arg(tune);
            }
        }
    }
    
    // Pixel format
    cmd.arg("-pix_fmt").arg(&ffmpeg_config.pixel_format);
    
    // Audio codec
    cmd.arg("-c:a").arg(&ffmpeg_config.audio_codec);
    
    // Additional flags - handle movflags and fflags specially
    let mut movflags = Vec::new();
    let mut fflags = Vec::new();
    let mut other_flags = Vec::new();
    
    for flag in &ffmpeg_config.additional_flags {
        if flag.starts_with("+") {
            // Flags like +faststart go to movflags
            movflags.push(flag.as_str());
        } else if flag.starts_with("fflags=") {
            // fflags like fflags=+genpts
            let fflag_value = flag.strip_prefix("fflags=").unwrap_or(flag);
            fflags.push(fflag_value);
        } else if flag.contains('=') {
            // Flags like avoid_negative_ts=make_zero
            let parts: Vec<&str> = flag.split('=').collect();
            if parts.len() == 2 {
                other_flags.push((format!("-{}", parts[0]), parts[1].to_string()));
            }
        } else if flag.starts_with("-") {
            // Already formatted flags
            other_flags.push((flag.clone(), String::new()));
        } else {
            // Simple flags
            other_flags.push((format!("-{}", flag), String::new()));
        }
    }
    
    // Add movflags if any (combine with +)
    if !movflags.is_empty() {
        cmd.arg("-movflags").arg(movflags.join("+"));
    }
    
    // Add fflags if any (combine with +)
    if !fflags.is_empty() {
        cmd.arg("-fflags").arg(fflags.join("+"));
    }
    
    // Add other flags
    for (flag, value) in other_flags {
        if value.is_empty() {
            cmd.arg(&flag);
        } else {
            cmd.arg(&flag).arg(&value);
        }
    }
    
    // Overwrite output
    cmd.arg("-y").arg(output_path);
    
    // Suppress output
    let output = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .context("Failed to execute ffmpeg")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg failed: {}", stderr);
    }

    Ok(())
}

/// Generate a thumbnail image from a video clip
/// Extracts a frame at the specified time (default 0.2s to avoid black frames)
pub async fn generate_thumbnail(
    video_path: &Path,
    thumbnail_path: &Path,
    time: f64,
) -> Result<()> {
    let mut cmd = Command::new("ffmpeg");
    
    // Input video
    cmd.arg("-i").arg(video_path);
    
    // Seek to specific time
    cmd.arg("-ss").arg(time.to_string());
    
    // Extract single frame
    cmd.arg("-vframes").arg("1");
    
    // Output format (JPEG)
    cmd.arg("-f").arg("image2");
    
    // Quality (2-31, lower is better quality)
    cmd.arg("-q:v").arg("2");
    
    // Overwrite output
    cmd.arg("-y").arg(thumbnail_path);
    
    // Suppress output
    let output = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .context("Failed to execute ffmpeg for thumbnail generation")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg thumbnail generation failed: {}", stderr);
    }

    Ok(())
}

/// Check if ffmpeg is available
#[allow(dead_code)]
pub async fn check_ffmpeg_available() -> Result<String> {
    let output = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .await
        .context("Failed to execute ffmpeg")?;

    if !output.status.success() {
        anyhow::bail!("ffmpeg not available");
    }

    let version = String::from_utf8_lossy(&output.stdout);
    Ok(version.lines().next().unwrap_or("unknown").to_string())
}

