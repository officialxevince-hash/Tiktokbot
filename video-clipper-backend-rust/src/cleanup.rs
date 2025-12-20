use crate::config::Config;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::fs;
use tracing::{error, info, warn};

/// Clean up old clips and uploads older than the specified duration
pub async fn cleanup_old_files(config: &Config, max_age: Duration) -> anyhow::Result<()> {
    let now = SystemTime::now();
    let mut total_deleted = 0;
    let mut total_size_freed = 0u64;

    // Clean up clips directory
    if let Err(e) = cleanup_directory(&config.output_dir, max_age, now, &mut total_deleted, &mut total_size_freed).await {
        error!("[cleanup] Error cleaning clips directory: {}", e);
    }

    // Clean up uploads directory
    if let Err(e) = cleanup_directory(&config.upload_dir, max_age, now, &mut total_deleted, &mut total_size_freed).await {
        error!("[cleanup] Error cleaning uploads directory: {}", e);
    }

    if total_deleted > 0 {
        let size_mb = total_size_freed as f64 / 1024.0 / 1024.0;
        info!(
            "[cleanup] ✅ Cleanup complete: {} files/directories deleted, {:.2} MB freed",
            total_deleted, size_mb
        );
    }

    Ok(())
}

/// Clean up a directory, removing files and directories older than max_age
async fn cleanup_directory(
    dir: &PathBuf,
    max_age: Duration,
    now: SystemTime,
    total_deleted: &mut usize,
    total_size_freed: &mut u64,
) -> anyhow::Result<()> {
    if !dir.exists() {
        return Ok(());
    }

    let mut entries = fs::read_dir(dir).await?;
    
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        
        // Get metadata
        let metadata = match fs::metadata(&path).await {
            Ok(m) => m,
            Err(e) => {
                warn!("[cleanup] Failed to get metadata for {:?}: {}", path, e);
                continue;
            }
        };

        // Get modification time
        let modified = match metadata.modified() {
            Ok(m) => m,
            Err(e) => {
                warn!("[cleanup] Failed to get modification time for {:?}: {}", path, e);
                continue;
            }
        };

        // Check if file/directory is older than max_age
        let age = match now.duration_since(modified) {
            Ok(d) => d,
            Err(_) => {
                // File is in the future (shouldn't happen, but handle gracefully)
                continue;
            }
        };

        if age > max_age {
            // Calculate size before deletion
            let size = if metadata.is_dir() {
                calculate_dir_size(&path).await.unwrap_or(0)
            } else {
                metadata.len()
            };

            // Delete the file or directory
            if metadata.is_dir() {
                match fs::remove_dir_all(&path).await {
                    Ok(()) => {
                        *total_deleted += 1;
                        *total_size_freed += size;
                        info!(
                            "[cleanup] ✅ Deleted old directory: {:?} (age: {:.1} min, size: {:.2} MB)",
                            path,
                            age.as_secs_f64() / 60.0,
                            size as f64 / 1024.0 / 1024.0
                        );
                    }
                    Err(e) => {
                        error!("[cleanup] ❌ Failed to delete directory {:?}: {}", path, e);
                    }
                }
            } else {
                match fs::remove_file(&path).await {
                    Ok(()) => {
                        *total_deleted += 1;
                        *total_size_freed += size;
                        info!(
                            "[cleanup] ✅ Deleted old file: {:?} (age: {:.1} min, size: {:.2} MB)",
                            path,
                            age.as_secs_f64() / 60.0,
                            size as f64 / 1024.0 / 1024.0
                        );
                    }
                    Err(e) => {
                        error!("[cleanup] ❌ Failed to delete file {:?}: {}", path, e);
                    }
                }
            }
        }
    }

    Ok(())
}

/// Calculate the total size of a directory recursively (iterative to avoid recursion issues)
async fn calculate_dir_size(dir: &PathBuf) -> anyhow::Result<u64> {
    let mut total_size = 0u64;
    let mut dirs_to_process = vec![dir.clone()];
    
    while let Some(current_dir) = dirs_to_process.pop() {
        let mut entries = match fs::read_dir(&current_dir).await {
            Ok(entries) => entries,
            Err(e) => {
                warn!("[cleanup] Failed to read directory {:?}: {}", current_dir, e);
                continue;
            }
        };
        
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let metadata = match fs::metadata(&path).await {
                Ok(m) => m,
                Err(e) => {
                    warn!("[cleanup] Failed to get metadata for {:?}: {}", path, e);
                    continue;
                }
            };
            
            if metadata.is_dir() {
                dirs_to_process.push(path);
            } else {
                total_size += metadata.len();
            }
        }
    }
    
    Ok(total_size)
}

/// Start a background task that periodically cleans up old files
pub fn start_cleanup_task(config: Arc<Config>) -> tokio::task::JoinHandle<()> {
    let max_age = Duration::from_secs(config.limits.cleanup_max_age_seconds);
    let cleanup_interval = Duration::from_secs(config.limits.cleanup_interval_seconds);
    
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(cleanup_interval);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        
        info!(
            "[cleanup] 🧹 Starting periodic cleanup task (interval: {:.1} min, max age: {:.1} min)",
            cleanup_interval.as_secs_f64() / 60.0,
            max_age.as_secs_f64() / 60.0
        );
        
        loop {
            interval.tick().await;
            
            if let Err(e) = cleanup_old_files(&config, max_age).await {
                error!("[cleanup] Periodic cleanup error: {}", e);
            }
        }
    })
}

