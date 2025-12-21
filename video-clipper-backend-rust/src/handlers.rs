use crate::{
    config::Config,
    ffmpeg,
    models::{Clip, ClipRequest, ClipResponse, ConfigResponse, ErrorResponse, SystemInfoResponse, UploadResponse, VideoMetadata},
    system_info,
};
use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::Json,
};
use std::{
    path::PathBuf,
    sync::Arc,
    time::SystemTime,
};
use tokio::io::AsyncWriteExt;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::models::AppState;

/// Upload video file
pub async fn upload_handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start_time = SystemTime::now();
    let mem_before = system_info::get_memory_usage();

    // Generate unique video ID early
    let video_id = format!(
        "{}{}",
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        Uuid::new_v4().to_string().replace('-', "")
    );

    let mut file_name: Option<String> = None;
    let mut file_path: Option<PathBuf> = None;
    let mut total_bytes: u64 = 0;

    info!("[POST /upload] Starting multipart parsing...");

    while let Some(mut field) = multipart.next_field().await.map_err(|e| {
        error!("[POST /upload] Multipart parsing error: {}", e);
        error!("[POST /upload] Error details: {:?}", e);
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Error parsing multipart request: {}", e),
            }),
        )
    })? {
        let name = field.name().unwrap_or(&state.config.server_defaults.default_field_name).to_string();
        info!("[POST /upload] Processing field: '{}'", name);
        
        if name == "file" {
            // Validate content type
            if let Some(content_type) = field.content_type() {
                info!("[POST /upload] Content-Type: {}", content_type);
                if !content_type.starts_with("video/") {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        Json(ErrorResponse {
                            error: "Only video files are allowed".to_string(),
                        }),
                    ));
                }
            }

            let original_name = field.file_name().unwrap_or(&state.config.server_defaults.default_filename).to_string();
            info!("[POST /upload] File name: {}", original_name);
            
            // Create file path
            let path = state.config.upload_dir.join(format!("{}-{}", video_id, original_name));
            file_name = Some(original_name);
            file_path = Some(path.clone());
            
            info!("[POST /upload] Streaming file to: {:?}", path);
            let stream_start = SystemTime::now();
            
            // Stream file directly to disk instead of loading into memory
            let mut file = tokio::fs::File::create(&path).await.map_err(|e| {
                error!("[POST /upload] Failed to create file: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to create file: {}", e),
                    }),
                )
            })?;

            // Stream chunks to file using buffered writes for better performance
            let mut chunk_count = 0;
            let mut buffer = Vec::with_capacity(state.config.upload_buffer_size); // Use configured buffer size
            
            loop {
                let chunk = match field.chunk().await {
                    Ok(Some(chunk)) => chunk,
                    Ok(None) => {
                        // Flush remaining buffer before breaking
                        if !buffer.is_empty() {
                            file.write_all(&buffer).await.map_err(|e| {
                                error!("[POST /upload] Failed to write final buffer: {}", e);
                                (
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(ErrorResponse {
                                        error: format!("Failed to write file: {}", e),
                                    }),
                                )
                            })?;
                            buffer.clear();
                        }
                        break; // End of stream
                    }
                    Err(e) => {
                        error!("[POST /upload] Failed to read chunk: {}", e);
                        return Err((
                            StatusCode::BAD_REQUEST,
                            Json(ErrorResponse {
                                error: format!("Failed to read file: {}", e),
                            }),
                        ));
                    }
                };
                
                // Check total size as we stream
                total_bytes += chunk.len() as u64;
                if total_bytes > state.config.max_file_size {
                    let file_size_mb = (total_bytes as f64 / 1024.0 / 1024.0) as f64;
                    error!(
                        "File too large: {:.2}MB (max: {}MB)",
                        file_size_mb,
                        state.config.max_file_size / 1024 / 1024
                    );
                    // Clean up partial file
                    let _ = tokio::fs::remove_file(&path).await;
                    return Err((
                        StatusCode::PAYLOAD_TOO_LARGE,
                        Json(ErrorResponse {
                            error: format!(
                                "File too large: {:.2}MB. Maximum file size is {}MB.",
                                file_size_mb,
                                state.config.max_file_size / 1024 / 1024
                            ),
                        }),
                    ));
                }

                // Buffer writes for better I/O performance
                buffer.extend_from_slice(&chunk);
                
                // Flush buffer when it reaches configured size
                if buffer.len() >= state.config.upload_buffer_size {
                    file.write_all(&buffer).await.map_err(|e| {
                        error!("[POST /upload] Failed to write chunk: {}", e);
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ErrorResponse {
                                error: format!("Failed to write file: {}", e),
                            }),
                        )
                    })?;
                    buffer.clear();
                }
                
                chunk_count += 1;
                if chunk_count % state.config.upload_log_interval == 0 {
                    let data_size_mb = (total_bytes as f64 / 1024.0 / 1024.0) as f64;
                    info!(
                        "[POST /upload] Streaming... {} chunks, {:.2} MB",
                        chunk_count, data_size_mb
                    );
                }
            }

            file.sync_all().await.map_err(|e| {
                error!("[POST /upload] Failed to sync file: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to save file: {}", e),
                    }),
                )
            })?;

            let stream_time = stream_start.elapsed().unwrap().as_secs_f64();
            let data_size_mb = (total_bytes as f64 / 1024.0 / 1024.0) as f64;
            info!(
                "[POST /upload] ✅ Streamed {} bytes ({:.2} MB) in {:.2}s ({} chunks)",
                total_bytes,
                data_size_mb,
                stream_time,
                chunk_count
            );
        }
    }

    info!("[POST /upload] ✅ Multipart parsing complete");

    let original_name = file_name.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "No file uploaded".to_string(),
            }),
        )
    })?;

    let file_path = file_path.unwrap();

    let file_size = total_bytes;
    let file_size_mb = (file_size as f64 / 1024.0 / 1024.0) as f64;

    info!("[POST /upload] ⏱️  START - {:?}", SystemTime::now());
    info!("[POST /upload] 📁 File: {}", original_name);
    info!(
        "[POST /upload] 📦 Size: {:.2} MB ({} bytes)",
        file_size_mb, file_size
    );
    info!(
        "[POST /upload] 💾 Memory before: RSS={:.2}MB",
        mem_before.rss_mb
    );

    // Get video duration
    info!("[POST /upload] Getting video duration...");
    let duration_start = SystemTime::now();
    let duration = ffmpeg::get_video_duration(&file_path)
        .await
        .map_err(|e| {
            error!("[POST /upload] Failed to get video duration: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to process video: {}", e),
                }),
            )
        })?;
    
    let duration_time = duration_start.elapsed().unwrap().as_secs_f64();
    info!("[POST /upload] ✅ Video duration: {:.2}s (detected in {:.2}s)", duration, duration_time);

    // Store video metadata
    let video_metadata = VideoMetadata {
        id: video_id.clone(),
        file_path: file_path.clone(),
        duration,
        original_name: original_name.clone(),
        file_size,
        uploaded_at: SystemTime::now(),
    };

    state
        .videos
        .write()
        .await
        .insert(video_id.clone(), video_metadata);

    let mem_after = system_info::get_memory_usage();
    let upload_time = start_time.elapsed().unwrap().as_secs_f64();
    let mem_delta = mem_after.rss_mb - mem_before.rss_mb;

    info!("[POST /upload] ✅ SUCCESS - Video ID: {}", video_id);
    info!("[POST /upload] ⏱️  Duration: {:.2}s", duration);
    info!("[POST /upload] ⏱️  Upload time: {:.2}s", upload_time);
    info!(
        "[POST /upload] 💾 Memory after: RSS={:.2}MB",
        mem_after.rss_mb
    );
    info!(
        "[POST /upload] 💾 Memory delta: {}{:.2}MB",
        if mem_delta > 0.0 { "+" } else { "" },
        mem_delta
    );

    Ok(Json(UploadResponse { video_id }))
}

/// Root route handler - returns API information
pub async fn root_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": "Video Clipper Backend",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "GET /": "API information (this endpoint)",
            "GET /config": "Get backend configuration and system limits",
            "POST /upload": "Upload a video file",
            "POST /clip": "Generate clips from an uploaded video",
            "GET /clips/*": "Serve generated clip files"
        }
    }))
}

/// Get backend configuration and system limits
pub async fn config_handler(
    State(state): State<Arc<AppState>>,
) -> Json<ConfigResponse> {
    let sys_info = system_info::get_system_info();
    
    // Calculate safe number of concurrent videos
    // Each video can generate multiple clips, so we need to be conservative
    // Formula: max(1, min(3, max_concurrent_clips / 3))
    // This ensures we don't overload the system while allowing some parallelism
    let max_concurrent_videos = {
        let calculated = (state.config.max_concurrent_clips as f64 / 3.0).ceil() as usize;
        calculated.max(1).min(3)
    };
    
    Json(ConfigResponse {
        max_concurrent_clips: state.config.max_concurrent_clips,
        max_file_size: state.config.max_file_size,
        max_concurrent_videos,
        system_info: SystemInfoResponse {
            cpus: sys_info.cpus,
            memory_free_gb: sys_info.memory_free_gb,
            memory_total_gb: sys_info.memory_total_gb,
        },
    })
}

/// Generate clips from video
pub async fn clip_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ClipRequest>,
) -> Result<Json<ClipResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start_time = SystemTime::now();
    let mem_before = system_info::get_memory_usage();

    // Get video metadata - check memory first, then file system (for multi-machine deployments)
    let video = {
        // First, try to get from in-memory HashMap
        let videos_read = state.videos.read().await;
        if let Some(video) = videos_read.get(&request.video_id) {
            Some(video.clone())
        } else {
            drop(videos_read); // Release the read lock
            
            // Not in memory - check file system (handles multi-machine scenario)
            info!("[POST /clip] Video not in memory, checking file system for video_id: {}", request.video_id);
            
            // Search for files starting with the video_id in uploads directory
            let mut entries = tokio::fs::read_dir(&state.config.upload_dir).await
                .map_err(|e| {
                    error!("[POST /clip] Failed to read uploads directory: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: format!("Failed to access uploads directory: {}", e),
                        }),
                    )
                })?;
            
            let mut found_file: Option<PathBuf> = None;
            while let Some(entry) = entries.next_entry().await
                .map_err(|e| {
                    error!("[POST /clip] Failed to read directory entry: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: format!("Failed to read directory: {}", e),
                        }),
                    )
                })? {
                let path = entry.path();
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name.starts_with(&request.video_id) {
                        found_file = Some(path);
                        break;
                    }
                }
            }
            
            if let Some(file_path) = found_file {
                info!("[POST /clip] Found video file on disk: {:?}", file_path);
                
                // Get file metadata
                let metadata = tokio::fs::metadata(&file_path).await
                    .map_err(|e| {
                        error!("[POST /clip] Failed to get file metadata: {}", e);
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ErrorResponse {
                                error: format!("Failed to read file: {}", e),
                            }),
                        )
                    })?;
                
                let file_size = metadata.len();
                
                // Get video duration
                let duration = ffmpeg::get_video_duration(&file_path).await
                    .map_err(|e| {
                        error!("[POST /clip] Failed to get video duration: {}", e);
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ErrorResponse {
                                error: format!("Failed to process video: {}", e),
                            }),
                        )
                    })?;
                
                // Extract original filename (remove video_id prefix and dash)
                let original_name = file_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|name| {
                        if let Some(stripped) = name.strip_prefix(&format!("{}-", request.video_id)) {
                            stripped.to_string()
                        } else {
                            name.to_string()
                        }
                    })
                    .unwrap_or_else(|| "video.mp4".to_string());
                
                // Create video metadata
                let video_metadata = VideoMetadata {
                    id: request.video_id.clone(),
                    file_path: file_path.clone(),
                    duration,
                    original_name: original_name.clone(),
                    file_size,
                    uploaded_at: SystemTime::now(),
                };
                
                // Store in memory for future use
                state.videos.write().await.insert(request.video_id.clone(), video_metadata.clone());
                info!("[POST /clip] ✅ Loaded video metadata from disk and cached in memory");
                
                Some(video_metadata)
            } else {
                None
            }
        }
    }
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Video not found".to_string(),
            }),
        )
    })?;

    let file_size_mb = (video.file_size as f64 / 1024.0 / 1024.0) as f64;

    info!("[POST /clip] ⏱️  START - {:?}", SystemTime::now());
    info!("[POST /clip] 📹 Video ID: {}", request.video_id);
    info!(
        "[POST /clip] 📁 File: {} ({:.2} MB)",
        video.original_name, file_size_mb
    );
    info!(
        "[POST /clip] ⏱️  Duration: {:.2}s, Max clip length: {:.2}s",
        video.duration, request.max_length
    );
    info!(
        "[POST /clip] 💾 Memory before: RSS={:.2}MB",
        mem_before.rss_mb
    );

    let sys_info = system_info::get_system_info();
    info!(
        "[POST /clip] 🖥️  System: {} CPUs, {:.2}GB free",
        sys_info.cpus, sys_info.memory_free_gb
    );

    // Use config default if max_length not provided
    let max_length = if request.max_length > 0.0 {
        request.max_length
    } else {
        state.config.limits.default_max_clip_length
    };
    
    // Generate clips
    let clips = generate_time_based_clips(
        &video.file_path,
        &request.video_id,
        video.duration,
        max_length,
        &state.config,
    )
    .await
    .map_err(|e| {
        let elapsed = start_time.elapsed().unwrap().as_secs_f64();
        error!("[POST /clip] ❌ ERROR after {:.2}s: {}", elapsed, e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to generate clips: {}", e),
            }),
        )
    })?;

    let mem_after = system_info::get_memory_usage();
    let total_time = start_time.elapsed().unwrap().as_secs_f64();
    let mem_delta = mem_after.rss_mb - mem_before.rss_mb;

    info!(
        "[POST /clip] ✅ SUCCESS - Generated {} clips in {:.2}s (total: {:.2}s)",
        clips.len(),
        total_time,
        total_time
    );
    info!(
        "[POST /clip] 💾 Memory after: RSS={:.2}MB",
        mem_after.rss_mb
    );
    info!(
        "[POST /clip] 💾 Memory delta: {}{:.2}MB",
        if mem_delta > 0.0 { "+" } else { "" },
        mem_delta
    );

    let clips_str = clips
        .iter()
        .map(|c| format!("{}({:.1}s)", c.id, c.duration))
        .collect::<Vec<_>>()
        .join(", ");
    info!("[POST /clip] 📊 Clips: {}", clips_str);

    // Housekeeping: Clean up unneeded files after successful clipping
    cleanup_after_clipping(&state, &video).await;

    Ok(Json(ClipResponse { clips }))
}

/// Generate time-based clips (optimized for speed)
async fn generate_time_based_clips(
    input_path: &PathBuf,
    video_id: &str,
    duration: f64,
    max_length: f64,
    config: &Config,
) -> anyhow::Result<Vec<Clip>> {
    use std::sync::Arc;
    use tokio::sync::Semaphore;

    let output_base = config.output_dir.join(video_id);
    tokio::fs::create_dir_all(&output_base).await?;

    let mem_start = system_info::get_memory_usage();

    // Calculate all clip segments
    let mut segments = Vec::new();
    let mut start = 0.0;
    let mut clip_index = 1;

    while start < duration {
        let clip_duration = (max_length).min(duration - start);

        if clip_duration >= config.optimization.min_clip_duration || start + clip_duration >= duration {
            segments.push((start, clip_duration, clip_index));
            clip_index += 1;
        }
        start += clip_duration;
    }

    let total_clips = segments.len();
    let clips_start_time = SystemTime::now();
    let sys_info = system_info::get_system_info();

    info!("[generateClips] 🎬 Generating {} clips in parallel batches...", total_clips);
    info!(
        "[generateClips] 💾 Memory at start: RSS={:.2}MB",
        mem_start.rss_mb
    );
    info!(
        "[generateClips] 🖥️  System: {:.2}GB free memory, {} CPUs available",
        sys_info.memory_free_gb, sys_info.cpus
    );

    // Process clips in parallel with semaphore for concurrency control
    // Use adaptive concurrency based on system resources
    let semaphore = Arc::new(Semaphore::new(config.max_concurrent_clips));
    let mut handles = Vec::new();

    // Pre-allocate handles vector for better performance
    handles.reserve(segments.len());

    for (clip_start, clip_duration, index) in segments {
        let permit = semaphore.clone().acquire_owned().await?;
        let input_path = input_path.clone();
        let output_base = output_base.clone();
        let video_id = video_id.to_string();

        let ffmpeg_config = config.ffmpeg.clone();
        let concurrent_clips = config.max_concurrent_clips;
        let handle = tokio::spawn(async move {
            let _permit = permit; // Hold permit until clip is done
            let clip_id = format!("clip-{}", index);
            let output_path = output_base.join(format!("{}.mp4", clip_id));

            let clip_start_time = SystemTime::now();
            let clip_mem_before = system_info::get_memory_usage();
            let clip_free_mem = system_info::get_system_info().memory_free_gb;

            info!(
                "[generateClips] 🎬 Clip {}/{} ({:.1}s-{:.1}s)",
                index,
                total_clips,
                clip_start,
                clip_start + clip_duration
            );
            info!(
                "[generateClips] 💾 Memory before clip: RSS={:.2}MB, Free={:.2}GB",
                clip_mem_before.rss_mb, clip_free_mem
            );
            match ffmpeg::generate_clip(&input_path, &output_path, clip_start, clip_duration, &ffmpeg_config, concurrent_clips).await
            {
                Ok(()) => {
                    let clip_time = clip_start_time.elapsed().unwrap().as_secs_f64();
                    let clip_mem_after = system_info::get_memory_usage();
                    let clip_mem_delta = clip_mem_after.rss_mb - clip_mem_before.rss_mb;
                    let clip_free_mem = system_info::get_system_info().memory_free_gb;

                    info!("[generateClips] ✓ Clip {} done in {:.2}s", index, clip_time);
                    info!(
                        "[generateClips] 💾 Memory after clip: RSS={:.2}MB ({}{:.2}MB), Free={:.2}GB",
                        clip_mem_after.rss_mb,
                        if clip_mem_delta > 0.0 { "+" } else { "" },
                        clip_mem_delta,
                        clip_free_mem
                    );

                    // Generate thumbnail for the clip (extract frame at 0.2s or 2% of duration)
                    let thumbnail_path = output_base.join(format!("{}.jpg", clip_id));
                    let thumbnail_time = 0.2f64.min(clip_duration * 0.02); // Use 0.2s or 2% of clip duration, whichever is smaller
                    
                    match ffmpeg::generate_thumbnail(&output_path, &thumbnail_path, thumbnail_time).await {
                        Ok(()) => {
                            info!("[generateClips] ✓ Thumbnail {} generated at {:.2}s", clip_id, thumbnail_time);
                        }
                        Err(e) => {
                            warn!("[generateClips] ⚠️  Failed to generate thumbnail for {}: {}", clip_id, e);
                            // Continue even if thumbnail generation fails - clip is still valid
                        }
                    }

                    Ok(Clip {
                        id: clip_id.clone(),
                        url: format!("/clips/{}/{}.mp4", video_id, clip_id),
                        thumbnail_url: format!("/clips/{}/{}.jpg", video_id, clip_id),
                        duration: clip_duration,
                    })
                }
                Err(e) => {
                    let clip_time = clip_start_time.elapsed().unwrap().as_secs_f64();
                    error!(
                        "[generateClips] ✗ Clip {} failed after {:.2}s: {}",
                        index, clip_time, e
                    );
                    Err(e)
                }
            }
        });

        handles.push((index, handle));
    }

    // Collect results - use try_join_all for better error handling
    // Pre-allocate clips vector
    let mut clips = Vec::with_capacity(handles.len());
    
    // Process handles in order but allow failures to not block others
    for (index, handle) in handles {
        match handle.await {
            Ok(Ok(clip)) => clips.push(clip),
            Ok(Err(e)) => {
                error!("[generateClips] Failed to generate clip {}: {}", index, e);
                // Continue with other clips
            }
            Err(e) => {
                error!("[generateClips] Task for clip {} panicked: {}", index, e);
                // Continue with other clips
            }
        }
    }

    // Sort clips by index
    clips.sort_by(|a, b| {
        let a_num: usize = a.id.split('-').nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        let b_num: usize = b.id.split('-').nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        a_num.cmp(&b_num)
    });

    let clips_time = clips_start_time.elapsed().unwrap().as_secs_f64();
    let mem_final = system_info::get_memory_usage();
    let mem_total_delta = mem_final.rss_mb - mem_start.rss_mb;

    info!(
        "[generateClips] ✅ All {} clips generated in {:.2}s",
        clips.len(),
        clips_time
    );
    info!(
        "[generateClips] 💾 Final memory: RSS={:.2}MB ({}{:.2}MB from start)",
        mem_final.rss_mb,
        if mem_total_delta > 0.0 { "+" } else { "" },
        mem_total_delta
    );
    info!(
        "[generateClips] ✓ All {} clips generated successfully",
        clips.len()
    );

    Ok(clips)
}

/// Clean up unneeded files after successful clipping
async fn cleanup_after_clipping(state: &Arc<AppState>, video: &VideoMetadata) {
    info!("[cleanup] 🧹 Starting housekeeping for video: {}", video.id);

    // Delete the original video file from uploads directory
    if video.file_path.exists() {
        match tokio::fs::remove_file(&video.file_path).await {
            Ok(()) => {
                let file_size_mb = (video.file_size as f64 / 1024.0 / 1024.0) as f64;
                info!(
                    "[cleanup] ✅ Deleted original video file: {} ({:.2} MB)",
                    video.file_path.display(),
                    file_size_mb
                );
            }
            Err(e) => {
                error!(
                    "[cleanup] ❌ Failed to delete original video file {}: {}",
                    video.file_path.display(),
                    e
                );
            }
        }
    } else {
        info!(
            "[cleanup] ℹ️  Original video file already removed: {}",
            video.file_path.display()
        );
    }

    // Remove video metadata from state
    let mut videos = state.videos.write().await;
    if videos.remove(&video.id).is_some() {
        info!("[cleanup] ✅ Removed video metadata from state: {}", video.id);
    } else {
        info!("[cleanup] ℹ️  Video metadata not found in state: {}", video.id);
    }

    info!("[cleanup] ✅ Housekeeping complete for video: {}", video.id);
}

