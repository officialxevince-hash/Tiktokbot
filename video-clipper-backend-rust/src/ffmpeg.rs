use anyhow::{Context, Result};
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

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
) -> Result<()> {
    // Get thread count (auto-detect if not set)
    let threads = ffmpeg_config.threads_per_clip.unwrap_or_else(|| {
        let cpu_count = num_cpus::get();
        (cpu_count / 2).max(1).min(4)
    });
    
    let mut cmd = Command::new("ffmpeg");
    
    // Input seeking: use input seeking if configured (faster)
    if ffmpeg_config.use_input_seeking {
        cmd.arg("-ss").arg(start_time.to_string());
    }
    
    cmd.arg("-i").arg(input_path);
    
    // Output seeking: use if not using input seeking
    if !ffmpeg_config.use_input_seeking {
        cmd.arg("-ss").arg(start_time.to_string());
    }
    
    // Duration
    cmd.arg("-t").arg(duration.to_string());
    
    // Video codec settings
    cmd.arg("-c:v").arg("libx264");
    cmd.arg("-preset").arg(&ffmpeg_config.preset);
    cmd.arg("-crf").arg(ffmpeg_config.crf.to_string());
    cmd.arg("-profile:v").arg(&ffmpeg_config.profile);
    cmd.arg("-level").arg(&ffmpeg_config.level);
    
    // Threading
    cmd.arg("-threads").arg(threads.to_string());
    
    // Tune settings
    for tune in &ffmpeg_config.tune {
        cmd.arg("-tune").arg(tune);
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

