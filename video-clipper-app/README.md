# Video Clipper App

A React Native Expo app that automatically splits videos into short clips using scene detection and silence detection.

## Features

- 📹 Import videos from device
- ✂️ Automatic clip generation using FFmpeg
- 👀 Preview generated clips
- 💾 Save clips to device

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator / Android Emulator / Physical device with Expo Go

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure API URL (optional):
Create a `.env` file in the root directory:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
```

3. Start the development server:
```bash
npx expo start
```

**Note:** If you need to test on a physical device on a different network, use `--tunnel` mode:
```bash
npx expo start --tunnel
```
However, this requires ngrok to be installed. For local development (simulator/emulator or same network), regular mode is sufficient.

## Running the App

- **iOS**: Press `i` in the terminal or scan QR code with Expo Go
- **Android**: Press `a` in the terminal or scan QR code with Expo Go
- **Web**: Press `w` in the terminal

## Project Structure

```
app/
  ├── _layout.tsx      # Root layout with navigation
  ├── index.tsx         # Video picker screen
  ├── processing.tsx    # Upload and processing screen
  ├── results.tsx     # Generated clips list
  └── clip/
      └── [id].tsx      # Fullscreen clip preview

utils/
  ├── api.ts           # API client functions
  └── config.ts        # Configuration
```

## API Integration

The app communicates with a Node.js backend for video processing. Make sure the backend is running before using the app.

See `../video-clipper-backend/README.md` for backend setup instructions.


