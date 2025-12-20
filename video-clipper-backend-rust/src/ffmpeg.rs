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

/// Generate a single clip from video
pub async fn generate_clip(
    input_path: &Path,
    output_path: &Path,
    start_time: f64,
    duration: f64,
) -> Result<()> {
    let output = Command::new("ffmpeg")
        .arg("-i")
        .arg(input_path)
        .arg("-ss")
        .arg(start_time.to_string())
        .arg("-t")
        .arg(duration.to_string())
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("28")
        .arg("-c:a")
        .arg("copy")
        .arg("-movflags")
        .arg("+faststart")
        .arg("-threads")
        .arg("1")
        .arg("-tune")
        .arg("fastdecode")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-bufsize")
        .arg("512k")
        .arg("-maxrate")
        .arg("1M")
        .arg("-thread_queue_size")
        .arg("512")
        .arg("-y") // Overwrite output file
        .arg(output_path)
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

