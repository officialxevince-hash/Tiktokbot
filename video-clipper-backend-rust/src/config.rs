use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub upload_dir: PathBuf,
    pub output_dir: PathBuf,
    pub max_file_size: u64,
    pub max_concurrent_clips: usize,
}

impl Config {
    pub fn from_env() -> Self {
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        let base_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."));

        let upload_dir = std::env::var("UPLOAD_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| base_dir.join("uploads"));

        let output_dir = std::env::var("OUTPUT_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| base_dir.join("clips"));

        let max_file_size = 500 * 1024 * 1024; // 500MB

        // Rust can handle more parallel processing due to better memory efficiency
        // Use 3 concurrent clips instead of 1 (Node.js limitation)
        let max_concurrent_clips = std::env::var("MAX_CONCURRENT_CLIPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3);

        Self {
            port,
            upload_dir,
            output_dir,
            max_file_size,
            max_concurrent_clips,
        }
    }
}


