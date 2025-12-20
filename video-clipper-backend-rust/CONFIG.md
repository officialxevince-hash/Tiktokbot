# Configuration Guide

The backend supports configuration through a `config.toml` file and environment variables. Environment variables take precedence over the config file.

## Configuration File

Create a `config.toml` file in the root directory of the backend. See `config.toml` for the default configuration.

## Environment Variables

All settings can be overridden with environment variables:

### Server Settings
- `PORT` - Server port (default: 3000)
- `UPLOAD_DIR` - Upload directory path
- `OUTPUT_DIR` - Output directory for clips
- `MAX_FILE_SIZE` - Maximum file size in bytes

### Performance Settings
- `MAX_CONCURRENT_CLIPS` - Maximum concurrent clip processing (0 = auto-detect)

## Configuration Sections

### [server]
Basic server configuration:
- `port`: Port to listen on
- `upload_dir`: Directory for uploaded videos
- `output_dir`: Directory for generated clips
- `max_file_size`: Maximum upload size in bytes

### [performance]
Performance tuning:
- `max_concurrent_clips`: Set to 0 for auto-detection (CPU count - 1, min 2, max 8)
- `upload_buffer_size`: Buffer size for uploads (64KB recommended)
- `upload_log_interval`: Log progress every N chunks

### [ffmpeg]
FFmpeg encoding settings:
- `preset`: Encoding preset (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow)
- `crf`: Quality setting (18-28, lower = better quality)
- `profile`: H.264 profile (baseline, main, high)
- `level`: H.264 level (3.0, 3.1, 4.0, etc.)
- `threads_per_clip`: Set to 0 for auto-detection (CPU count / 2, min 1, max 4)
- `pixel_format`: Pixel format (yuv420p recommended)
- `tune`: Tune settings array (fastdecode, zerolatency, etc.)
- `audio_codec`: Audio codec (copy = no re-encoding, fastest)
- `use_input_seeking`: Use input seeking for faster processing
- `additional_flags`: Additional FFmpeg flags

### [optimization]
Optimization settings:
- `enable_buffered_uploads`: Enable buffered file writes
- `preallocate_vectors`: Pre-allocate memory for better performance
- `min_clip_duration`: Minimum clip duration in seconds
- `log_level`: Logging verbosity (trace, debug, info, warn, error)

### [limits]
Resource limits:
- `max_cached_videos`: Maximum videos in memory cache
- `clip_generation_timeout`: Timeout for clip generation (0 = no timeout)
- `upload_timeout`: Timeout for uploads (0 = no timeout)

## Examples

### High Performance Configuration
```toml
[performance]
max_concurrent_clips = 8

[ffmpeg]
preset = "ultrafast"
crf = 28
threads_per_clip = 4
```

### High Quality Configuration
```toml
[ffmpeg]
preset = "fast"
crf = 20
profile = "high"
```

### Memory-Constrained Configuration
```toml
[performance]
max_concurrent_clips = 2

[ffmpeg]
threads_per_clip = 1
```

## Auto-Detection

The following settings support auto-detection (set to 0 or leave unset):
- `max_concurrent_clips`: Based on CPU count
- `threads_per_clip`: Based on CPU count

Auto-detection ensures optimal performance based on your system resources.



