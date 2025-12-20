# Video Clipper MVP

A complete MVP React Native Expo app with Node.js backend for automatically splitting videos into short clips.

## Project Structure

```
Tiktokbot/
├── video-clipper-app/      # React Native Expo frontend
└── video-clipper-backend/   # Node.js + FFmpeg backend
```

## Quick Start

### Backend Setup

1. Navigate to backend directory:
```bash
cd video-clipper-backend
```

2. Install dependencies:
```bash
npm install
```

3. Ensure FFmpeg is installed (see backend README)

4. Start the server:
```bash
npm run dev
```

### Frontend Setup

1. Navigate to app directory:
```bash
cd video-clipper-app
```

2. Install dependencies:
```bash
npm install
```

3. Configure API URL (create `.env` file):
```
EXPO_PUBLIC_API_URL=http://localhost:3000
```

4. Start Expo:
```bash
npx expo start
```

## Features

✅ Video import from device  
✅ Automatic clip generation using scene/silence detection  
✅ Preview clips with native video controls  
✅ Save clips to device  
✅ Clean, TypeScript codebase  
✅ MVP-ready for testing  

## Architecture

- **Frontend**: Expo SDK with expo-router, expo-video, expo-media-library
- **Backend**: Node.js + Express + FFmpeg
- **Processing**: Server-side only (no on-device processing)

## Documentation

- [Frontend README](./video-clipper-app/README.md)
- [Backend README](./video-clipper-backend/README.md)
