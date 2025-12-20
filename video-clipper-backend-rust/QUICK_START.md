# Quick Start Guide

## Local Development

```bash
# 1. Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Navigate to backend directory
cd video-clipper-backend-rust

# 3. Build the project
cargo build --release

# 4. Run the server
cargo run --release

# Server will start on http://localhost:3000
```

## Testing the API

### 1. Upload a Video

```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@/path/to/your/video.mp4"
```

Response:
```json
{
  "video_id": "abc123xyz"
}
```

### 2 Generate Clips

```bash
curl -X POST http://localhost:3000/clip \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "abc123xyz",
    "max_length": 15
  }'
```

Response:
```json
{
  "clips": [
    {
      "id": "clip-1",
      "url": "/clips/abc123xyz/clip-1.mp4",
      "duration": 15.0
    }
  ]
}
```

### 3 Download a Clip

```bash
curl http://localhost:3000/clips/abc123xyz/clip-1.mp4 -o clip-1.mp4
```

## Deployment to Render

1. **Create new service** in Render dashboard
2. **Connect GitHub repo**
3. **Set build command**: `cargo build --release`
4. **Set start command**: `./target/release/video-clipper-backend`
5. **Set environment variables**:
   - `PORT` (auto-set by Render)
   - `UPLOAD_DIR=/opt/render/project/src/video-clipper-backend-rust/uploads`
   - `OUTPUT_DIR=/opt/render/project/src/video-clipper-backend-rust/clips`
   - `MAX_CONCURRENT_CLIPS=3`

## Performance Tips

- **Increase parallel clips**: Set `MAX_CONCURRENT_CLIPS=5` for faster processing (if you have enough memory)
- **Use release build**: Always use `--release` flag for production
- **Monitor memory**: Check logs for memory usage per clip

## Troubleshooting

### FFmpeg not found
```bash
# Install FFmpeg
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Verify installation
ffmpeg -version
```

### Port already in use
```bash
# Change port via environment variable
PORT=3001 cargo run --release
```

### Memory issues
- Reduce `MAX_CONCURRENT_CLIPS` to 2 or 1
- Check system memory with `free -h` (Linux) or Activity Monitor (macOS)




