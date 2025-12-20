use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub upload_dir: String,
    pub output_dir: String,
    pub max_file_size: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PerformanceConfig {
    #[serde(default)]
    pub max_concurrent_clips: Option<usize>, // None = auto-detect
    pub upload_buffer_size: usize,
    pub upload_log_interval: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FfmpegConfig {
    pub preset: String,
    pub crf: u8,
    pub profile: String,
    pub level: String,
    #[serde(default)]
    pub threads_per_clip: Option<usize>, // None = auto-detect
    pub pixel_format: String,
    pub tune: Vec<String>,
    pub audio_codec: String,
    pub use_input_seeking: bool,
    pub additional_flags: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OptimizationConfig {
    pub enable_buffered_uploads: bool,
    pub preallocate_vectors: bool,
    pub min_clip_duration: f64,
    pub log_level: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LimitsConfig {
    pub max_cached_videos: usize,
    pub clip_generation_timeout: u64,
    pub upload_timeout: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigFile {
    pub server: ServerConfig,
    pub performance: PerformanceConfig,
    pub ffmpeg: FfmpegConfig,
    pub optimization: OptimizationConfig,
    pub limits: LimitsConfig,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub upload_dir: PathBuf,
    pub output_dir: PathBuf,
    pub max_file_size: u64,
    pub max_concurrent_clips: usize,
    pub upload_buffer_size: usize,
    pub upload_log_interval: usize,
    pub ffmpeg: FfmpegConfig,
    pub optimization: OptimizationConfig,
    pub limits: LimitsConfig,
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let base_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."));

        // Try to load config file
        let config_path = base_dir.join("config.toml");
        let config_file = if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)?;
            Some(toml::from_str::<ConfigFile>(&content)?)
        } else {
            None
        };

        // Load server config (env vars override config file)
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .or_else(|| config_file.as_ref().map(|c| c.server.port))
            .unwrap_or(3000);

        let upload_dir_str = std::env::var("UPLOAD_DIR")
            .or_else(|_| config_file.as_ref().map(|c| c.server.upload_dir.clone()).ok_or(()))
            .unwrap_or_else(|_| "uploads".to_string());

        let output_dir_str = std::env::var("OUTPUT_DIR")
            .or_else(|_| config_file.as_ref().map(|c| c.server.output_dir.clone()).ok_or(()))
            .unwrap_or_else(|_| "clips".to_string());

        let upload_dir = if upload_dir_str.starts_with('/') {
            PathBuf::from(upload_dir_str)
        } else {
            base_dir.join(upload_dir_str)
        };

        let output_dir = if output_dir_str.starts_with('/') {
            PathBuf::from(output_dir_str)
        } else {
            base_dir.join(output_dir_str)
        };

        let max_file_size = std::env::var("MAX_FILE_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .or_else(|| config_file.as_ref().map(|c| c.server.max_file_size))
            .unwrap_or(500 * 1024 * 1024);

        // Performance config
        let cpu_count = num_cpus::get();
        let default_concurrent = (cpu_count.saturating_sub(1)).max(2).min(8);
        
        let max_concurrent_clips = std::env::var("MAX_CONCURRENT_CLIPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .or_else(|| {
                config_file.as_ref()
                    .and_then(|c| c.performance.max_concurrent_clips)
                    .filter(|&v| v > 0)
                    .map(|v| v)
            })
            .unwrap_or(default_concurrent);

        let upload_buffer_size = config_file.as_ref()
            .map(|c| c.performance.upload_buffer_size)
            .unwrap_or(65536);

        let upload_log_interval = config_file.as_ref()
            .map(|c| c.performance.upload_log_interval)
            .unwrap_or(100);

        // FFmpeg config
        let ffmpeg = config_file.as_ref()
            .map(|c| c.ffmpeg.clone())
            .unwrap_or_else(|| FfmpegConfig {
                preset: "veryfast".to_string(),
                crf: 23,
                profile: "baseline".to_string(),
                level: "3.0".to_string(),
                threads_per_clip: None,
                pixel_format: "yuv420p".to_string(),
                tune: vec!["fastdecode".to_string(), "zerolatency".to_string()],
                audio_codec: "copy".to_string(),
                use_input_seeking: true,
                additional_flags: vec!["+faststart".to_string(), "fflags=+genpts".to_string(), "avoid_negative_ts=make_zero".to_string()],
            });

        // Optimization config
        let optimization = config_file.as_ref()
            .map(|c| c.optimization.clone())
            .unwrap_or_else(|| OptimizationConfig {
                enable_buffered_uploads: true,
                preallocate_vectors: true,
                min_clip_duration: 3.0,
                log_level: "info".to_string(),
            });

        // Limits config
        let limits = config_file.as_ref()
            .map(|c| c.limits.clone())
            .unwrap_or_else(|| LimitsConfig {
                max_cached_videos: 1000,
                clip_generation_timeout: 0,
                upload_timeout: 0,
            });

        Ok(Self {
            port,
            upload_dir,
            output_dir,
            max_file_size,
            max_concurrent_clips,
            upload_buffer_size,
            upload_log_interval,
            ffmpeg,
            optimization,
            limits,
        })
    }

    // Backward compatibility
    pub fn from_env() -> Self {
        Self::load().unwrap_or_else(|e| {
            eprintln!("Warning: Failed to load config: {}. Using defaults.", e);
            Self::default()
        })
    }
}

impl Default for Config {
    fn default() -> Self {
        let base_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let cpu_count = num_cpus::get();
        let default_concurrent = (cpu_count.saturating_sub(1)).max(2).min(8);

        Self {
            port: 3000,
            upload_dir: base_dir.join("uploads"),
            output_dir: base_dir.join("clips"),
            max_file_size: 500 * 1024 * 1024,
            max_concurrent_clips: default_concurrent,
            upload_buffer_size: 65536,
            upload_log_interval: 100,
            ffmpeg: FfmpegConfig {
                preset: "veryfast".to_string(),
                crf: 23,
                profile: "baseline".to_string(),
                level: "3.0".to_string(),
                threads_per_clip: None,
                pixel_format: "yuv420p".to_string(),
                tune: vec!["fastdecode".to_string(), "zerolatency".to_string()],
                audio_codec: "copy".to_string(),
                use_input_seeking: true,
                additional_flags: vec!["+faststart".to_string(), "fflags=+genpts".to_string(), "avoid_negative_ts=make_zero".to_string()],
            },
            optimization: OptimizationConfig {
                enable_buffered_uploads: true,
                preallocate_vectors: true,
                min_clip_duration: 3.0,
                log_level: "info".to_string(),
            },
            limits: LimitsConfig {
                max_cached_videos: 1000,
                clip_generation_timeout: 0,
                upload_timeout: 0,
            },
        }
    }
}


