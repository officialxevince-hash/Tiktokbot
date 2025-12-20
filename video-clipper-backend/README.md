# Video Clipper Backend

Node.js backend API for video processing using FFmpeg. Handles video uploads and automatic clip generation.

## Prerequisites

- Node.js 18+
- FFmpeg installed on your system

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use chocolatey:
```bash
choco install ffmpeg
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment (optional):
Create a `.env` file:
```
PORT=3000
UPLOAD_DIR=./uploads
OUTPUT_DIR=./clips
```

3. Start the server:
```bash
npm run dev
```

The server will run on `http://localhost:3000`

## API Endpoints

### POST /upload

Upload a video file.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `file` (video file)

**Response:**
```json
{
  "videoId": "abc123"
}
```

### POST /clip

Generate clips from an uploaded video.

**Request:**
```json
{
  "videoId": "abc123",
  "maxLength": 15
}
```

**Response:**
```json
{
  "clips": [
    {
      "id": "clip-1",
      "url": "/clips/abc123/clip-1.mp4",
      "duration": 8.4
    }
  ]
}
```

## Clipping Strategy

The backend uses FFmpeg to detect:
- **Scene changes**: Detects visual scene transitions
- **Silence**: Detects audio silence periods

Clips are generated at these detected points with:
- Maximum length: 15 seconds (configurable)
- Minimum length: 3 seconds
- Automatic fallback to time-based splitting if detection fails

## File Structure

```
uploads/          # Uploaded videos (temporary)
clips/            # Generated clips
  └── {videoId}/
      ├── clip-1.mp4
      ├── clip-2.mp4
      └── ...
```

## Notes

- Uploaded videos are stored temporarily in the `uploads/` directory
- Generated clips are served statically from `/clips` endpoint
- Maximum upload size: 500MB (configurable in `server.js`)

