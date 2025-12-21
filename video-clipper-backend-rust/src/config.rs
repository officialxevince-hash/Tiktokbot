use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PerformanceConfig {
    #[serde(default)]
    pub max_concurrent_clips: Option<usize>, // None = auto-detect
    pub upload_buffer_size: usize,
    pub upload_log_interval: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FfmpegAdvancedConfig {
    #[serde(default = "default_thread_queue_size")]
    pub thread_queue_size: usize,
    #[serde(default = "default_bufsize")]
    pub bufsize: String,
    #[serde(default = "default_maxrate")]
    pub maxrate: String,
    #[serde(default = "default_gop_size")]
    pub gop_size: u32,
    #[serde(default = "default_keyint_min")]
    pub keyint_min: u32,
    #[serde(default = "default_video_codec")]
    pub default_video_codec: String,
    #[serde(default = "default_videotoolbox_quality_min")]
    pub videotoolbox_quality_min: u8,
    #[serde(default = "default_videotoolbox_quality_max")]
    pub videotoolbox_quality_max: u8,
    #[serde(default = "default_videotoolbox_crf_multiplier")]
    pub videotoolbox_crf_multiplier: f64,
    #[serde(default = "default_nvenc_preset")]
    pub nvenc_preset: String,
    #[serde(default = "default_nvenc_rc")]
    pub nvenc_rc: String,
    #[serde(default = "default_qsv_preset")]
    pub qsv_preset: String,
    #[serde(default = "default_amf_quality")]
    pub amf_quality: String,
    #[serde(default = "default_amf_rc")]
    pub amf_rc: String,
    #[serde(default = "default_threads_1_2_min")]
    pub threads_when_1_2_clips_min: usize,
    #[serde(default = "default_threads_1_2_max")]
    pub threads_when_1_2_clips_max: usize,
    #[serde(default = "default_threads_3_4_min")]
    pub threads_when_3_4_clips_min: usize,
    #[serde(default = "default_threads_3_4_max")]
    pub threads_when_3_4_clips_max: usize,
    #[serde(default = "default_threads_many_min")]
    pub threads_when_many_clips_min: usize,
    #[serde(default = "default_threads_many_max")]
    pub threads_when_many_clips_max: usize,
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
    #[serde(default)]
    pub advanced: Option<FfmpegAdvancedConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OptimizationConfig {
    pub enable_buffered_uploads: bool,
    pub preallocate_vectors: bool,
    pub min_clip_duration: f64,
    pub log_level: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServerDefaultsConfig {
    #[serde(default = "default_filename")]
    pub default_filename: String,
    #[serde(default = "default_field_name")]
    pub default_field_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub upload_dir: String,
    pub output_dir: String,
    pub max_file_size: u64,
    #[serde(default)]
    pub defaults: Option<ServerDefaultsConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LimitsConfig {
    pub max_cached_videos: usize,
    pub clip_generation_timeout: u64,
    pub upload_timeout: u64,
    #[serde(default = "default_max_clip_length")]
    pub default_max_clip_length: f64,
    #[serde(default = "default_cleanup_interval")]
    pub cleanup_interval_seconds: u64,
    #[serde(default = "default_cleanup_max_age")]
    pub cleanup_max_age_seconds: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigFile {
    pub server: ServerConfig,
    pub performance: PerformanceConfig,
    pub ffmpeg: FfmpegConfig,
    pub optimization: OptimizationConfig,
    pub limits: LimitsConfig,
}

// Default functions for serde
fn default_thread_queue_size() -> usize { 512 }
fn default_bufsize() -> String { "2M".to_string() }
fn default_maxrate() -> String { "8M".to_string() }
fn default_gop_size() -> u32 { 30 }
fn default_keyint_min() -> u32 { 30 }
fn default_video_codec() -> String { "libx264".to_string() }
fn default_videotoolbox_quality_min() -> u8 { 50 }
fn default_videotoolbox_quality_max() -> u8 { 100 }
fn default_videotoolbox_crf_multiplier() -> f64 { 3.57 }
fn default_nvenc_preset() -> String { "p4".to_string() }
fn default_nvenc_rc() -> String { "vbr".to_string() }
fn default_qsv_preset() -> String { "balanced".to_string() }
fn default_amf_quality() -> String { "balanced".to_string() }
fn default_amf_rc() -> String { "vbr_peak".to_string() }
fn default_threads_1_2_min() -> usize { 2 }
fn default_threads_1_2_max() -> usize { 6 }
fn default_threads_3_4_min() -> usize { 1 }
fn default_threads_3_4_max() -> usize { 4 }
fn default_threads_many_min() -> usize { 1 }
fn default_threads_many_max() -> usize { 2 }
fn default_filename() -> String { "video.mp4".to_string() }
fn default_field_name() -> String { "".to_string() }
fn default_max_clip_length() -> f64 { 15.0 }
fn default_cleanup_interval() -> u64 { 300 }
fn default_cleanup_max_age() -> u64 { 1800 }

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
    pub server_defaults: ServerDefaultsConfig,
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
            .unwrap_or(524288); // 512KB default for better performance with large files

        let upload_log_interval = config_file.as_ref()
            .map(|c| c.performance.upload_log_interval)
            .unwrap_or(100);

        // FFmpeg config
        let ffmpeg = config_file.as_ref()
            .map(|c| c.ffmpeg.clone())
            .unwrap_or_else(|| FfmpegConfig {
                preset: "medium".to_string(), // Good balance of quality and speed
                crf: 20, // High quality (lower is better, 18-23 range recommended)
                profile: "high".to_string(), // Best quality profile
                level: "4.0".to_string(), // Higher level for better quality
                threads_per_clip: None,
                pixel_format: "yuv420p".to_string(),
                tune: vec![], // No tune for better quality (removed fastdecode/zerolatency)
                audio_codec: "copy".to_string(),
                use_input_seeking: true,
                additional_flags: vec!["+faststart".to_string(), "fflags=+genpts".to_string(), "avoid_negative_ts=make_zero".to_string()],
                advanced: None, // Will be populated below
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
                default_max_clip_length: default_max_clip_length(),
                cleanup_interval_seconds: default_cleanup_interval(),
                cleanup_max_age_seconds: default_cleanup_max_age(),
            });

        // Server defaults config
        let server_defaults = config_file.as_ref()
            .and_then(|c| c.server.defaults.clone())
            .unwrap_or_else(|| ServerDefaultsConfig {
                default_filename: default_filename(),
                default_field_name: default_field_name(),
            });

        // Ensure FFmpeg advanced config is populated
        let ffmpeg = if ffmpeg.advanced.is_none() {
            FfmpegConfig {
                advanced: Some(FfmpegAdvancedConfig {
                    thread_queue_size: default_thread_queue_size(),
                    bufsize: default_bufsize(),
                    maxrate: default_maxrate(),
                    gop_size: default_gop_size(),
                    keyint_min: default_keyint_min(),
                    default_video_codec: default_video_codec(),
                    videotoolbox_quality_min: default_videotoolbox_quality_min(),
                    videotoolbox_quality_max: default_videotoolbox_quality_max(),
                    videotoolbox_crf_multiplier: default_videotoolbox_crf_multiplier(),
                    nvenc_preset: default_nvenc_preset(),
                    nvenc_rc: default_nvenc_rc(),
                    qsv_preset: default_qsv_preset(),
                    amf_quality: default_amf_quality(),
                    amf_rc: default_amf_rc(),
                    threads_when_1_2_clips_min: default_threads_1_2_min(),
                    threads_when_1_2_clips_max: default_threads_1_2_max(),
                    threads_when_3_4_clips_min: default_threads_3_4_min(),
                    threads_when_3_4_clips_max: default_threads_3_4_max(),
                    threads_when_many_clips_min: default_threads_many_min(),
                    threads_when_many_clips_max: default_threads_many_max(),
                }),
                ..ffmpeg
            }
        } else {
            ffmpeg
        };

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
            server_defaults,
        })
    }

    // Backward compatibility - deprecated, use load() instead
    #[deprecated(note = "Use Config::load() instead")]
    #[allow(dead_code)]
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
            upload_buffer_size: 524288, // 512KB for better I/O performance with large files
            upload_log_interval: 100,
            ffmpeg: FfmpegConfig {
                preset: "medium".to_string(), // Good balance of quality and speed
                crf: 20, // High quality (lower is better, 18-23 range recommended)
                profile: "high".to_string(), // Best quality profile
                level: "4.0".to_string(), // Higher level for better quality
                threads_per_clip: None,
                pixel_format: "yuv420p".to_string(),
                tune: vec![], // No tune for better quality (removed fastdecode/zerolatency)
                audio_codec: "copy".to_string(),
                use_input_seeking: true,
                additional_flags: vec!["+faststart".to_string(), "fflags=+genpts".to_string(), "avoid_negative_ts=make_zero".to_string()],
                advanced: Some(FfmpegAdvancedConfig {
                    thread_queue_size: default_thread_queue_size(),
                    bufsize: default_bufsize(),
                    maxrate: default_maxrate(),
                    gop_size: default_gop_size(),
                    keyint_min: default_keyint_min(),
                    default_video_codec: default_video_codec(),
                    videotoolbox_quality_min: default_videotoolbox_quality_min(),
                    videotoolbox_quality_max: default_videotoolbox_quality_max(),
                    videotoolbox_crf_multiplier: default_videotoolbox_crf_multiplier(),
                    nvenc_preset: default_nvenc_preset(),
                    nvenc_rc: default_nvenc_rc(),
                    qsv_preset: default_qsv_preset(),
                    amf_quality: default_amf_quality(),
                    amf_rc: default_amf_rc(),
                    threads_when_1_2_clips_min: default_threads_1_2_min(),
                    threads_when_1_2_clips_max: default_threads_1_2_max(),
                    threads_when_3_4_clips_min: default_threads_3_4_min(),
                    threads_when_3_4_clips_max: default_threads_3_4_max(),
                    threads_when_many_clips_min: default_threads_many_min(),
                    threads_when_many_clips_max: default_threads_many_max(),
                }),
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
                default_max_clip_length: default_max_clip_length(),
                cleanup_interval_seconds: default_cleanup_interval(),
                cleanup_max_age_seconds: default_cleanup_max_age(),
            },
            server_defaults: ServerDefaultsConfig {
                default_filename: default_filename(),
                default_field_name: default_field_name(),
            },
        }
    }
}


