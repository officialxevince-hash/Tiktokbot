use crate::{
    config::Config,
    ffmpeg,
    models::{Clip, ClipRequest, ClipResponse, ErrorResponse, UploadResponse, VideoMetadata},
    system_info,
};
use axum::{
    body::Body,
    extract::{Request, State},
    http::{header::CONTENT_TYPE, StatusCode},
    response::Json,
};
use multer::Multipart;
use http_body_util::BodyExt;
use std::{
    path::PathBuf,
    sync::Arc,
    time::SystemTime,
};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::models::AppState;

/// Upload video file
pub async fn upload_handler(
    State(state): State<Arc<AppState>>,
    request: Request<Body>,
) -> Result<Json<UploadResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start_time = SystemTime::now();
    let mem_before = system_info::get_memory_usage();

    // Get content type
    let content_type = request.headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Missing Content-Type header".to_string(),
                }),
            )
        })?;

    // Parse boundary from content type
    let boundary = multer::parse_boundary(content_type).map_err(|e| {
        error!("Failed to parse boundary: {}", e);
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Invalid multipart request: {}", e),
            }),
        )
    })?;

    // Convert body to bytes
    let body_bytes = request.into_body()
        .collect()
        .await
        .map_err(|e| {
            error!("Failed to read request body: {}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("Failed to read request: {}", e),
                }),
            )
        })?
        .to_bytes();

    // Create multipart parser
    let mut multipart = Multipart::with_reader(
        body_bytes.as_ref(),
        boundary,
        multer::Constraints::new()
            .max_field_size(state.config.max_file_size)
            .max_fields(10)
            .max_field_name_size(100)
            .max_file_size(state.config.max_file_size),
    );

    // Find the file field
    let mut file_data: Option<(String, Vec<u8>)> = None;

    while let Some(mut field) = multipart.next_field().await.map_err(|e| {
        error!("Multipart parsing error: {}", e);
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Error parsing multipart request: {}", e),
            }),
        )
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            // Validate content type
            if let Some(content_type) = field.content_type() {
                if !content_type.starts_with("video/") {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        Json(ErrorResponse {
                            error: "Only video files are allowed".to_string(),
                        }),
                    ));
                }
            }

            let file_name = field.file_name().unwrap_or("video.mp4").to_string();
            
            // Read field data in chunks to handle large files
            let mut data = Vec::new();
            while let Some(chunk) = field.chunk().await.map_err(|e| {
                error!("Failed to read file chunk: {}", e);
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("Failed to read file: {}", e),
                    }),
                )
            })? {
                data.extend_from_slice(&chunk);
                
                // Check file size as we read
                if data.len() as u64 > state.config.max_file_size {
                    let file_size_mb = (data.len() as f64 / 1024.0 / 1024.0) as f64;
                    error!(
                        "File too large: {:.2}MB (max: {}MB)",
                        file_size_mb,
                        state.config.max_file_size / 1024 / 1024
                    );
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
            }

            file_data = Some((file_name, data));
        } else {
            // Skip non-file fields
            while field.next_chunk().await.map_err(|e| {
                error!("Failed to skip field: {}", e);
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("Failed to process request: {}", e),
                    }),
                )
            })?.is_some() {
                // Drain the field
            }
        }
    }

    let (original_name, file_bytes) = file_data.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "No file uploaded".to_string(),
            }),
        )
    })?;

    // Generate unique video ID
    let video_id = format!(
        "{}{}",
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        Uuid::new_v4().to_string().replace('-', "")
    );

    // Save file
    let file_path = state.config.upload_dir.join(format!("{}-{}", video_id, original_name));
    tokio::fs::write(&file_path, file_bytes)
        .await
        .map_err(|e| {
            error!("Failed to save file: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to save file: {}", e),
                }),
            )
        })?;

    let file_size = tokio::fs::metadata(&file_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

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
    let duration = ffmpeg::get_video_duration(&file_path)
        .await
        .map_err(|e| {
            error!("Failed to get video duration: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to process video: {}", e),
                }),
            )
        })?;

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

/// Generate clips from video
pub async fn clip_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ClipRequest>,
) -> Result<Json<ClipResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start_time = SystemTime::now();
    let mem_before = system_info::get_memory_usage();

    // Get video metadata
    let video = state
        .videos
        .read()
        .await
        .get(&request.video_id)
        .cloned()
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

    // Generate clips
    let clips = generate_time_based_clips(
        &video.file_path,
        &request.video_id,
        video.duration,
        request.max_length,
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

        if clip_duration >= 3.0 || start + clip_duration >= duration {
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
    let semaphore = Arc::new(Semaphore::new(config.max_concurrent_clips));
    let mut handles = Vec::new();

    for (clip_start, clip_duration, index) in segments {
        let permit = semaphore.clone().acquire_owned().await?;
        let input_path = input_path.clone();
        let output_base = output_base.clone();
        let video_id = video_id.to_string();

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

            match ffmpeg::generate_clip(&input_path, &output_path, clip_start, clip_duration).await
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

                    Ok(Clip {
                        id: clip_id,
                        url: format!("/clips/{}/{}.mp4", video_id, index),
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

    // Collect results
    let mut clips = Vec::new();
    for (index, handle) in handles {
        match handle.await? {
            Ok(clip) => clips.push(clip),
            Err(e) => {
                error!("[generateClips] Failed to generate clip {}: {}", index, e);
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

