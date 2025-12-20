use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub id: String,
    pub file_path: PathBuf,
    pub duration: f64,
    pub original_name: String,
    pub file_size: u64,
    pub uploaded_at: SystemTime,
}

#[derive(Clone)]
pub struct AppState {
    pub videos: Arc<tokio::sync::RwLock<std::collections::HashMap<String, VideoMetadata>>>,
    pub config: crate::config::Config,
}


#[derive(Deserialize)]
pub struct ClipRequest {
    pub video_id: String,
    #[serde(default = "default_max_length")]
    pub max_length: f64,
}

fn default_max_length() -> f64 {
    // This will be overridden by config when available
    // The actual default comes from config.limits.default_max_clip_length
    15.0
}

#[derive(Serialize)]
pub struct Clip {
    pub id: String,
    pub url: String,
    pub thumbnail_url: String,
    pub duration: f64,
}

#[derive(Serialize)]
pub struct UploadResponse {
    pub video_id: String,
}

#[derive(Serialize)]
pub struct ClipResponse {
    pub clips: Vec<Clip>,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Serialize)]
pub struct ConfigResponse {
    pub max_concurrent_clips: usize,
    pub max_file_size: u64,
    pub max_concurrent_videos: usize, // Calculated: safe number of videos to process concurrently
    pub system_info: SystemInfoResponse,
}

#[derive(Serialize)]
pub struct SystemInfoResponse {
    pub cpus: usize,
    pub memory_free_gb: f64,
    pub memory_total_gb: f64,
}

