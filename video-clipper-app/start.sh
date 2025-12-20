#!/bin/bash
# Start Expo with Watchman disabled to avoid permission issues

export WATCHMAN_DISABLE_FILE_WATCHING=1
# Don't set CI=true - it disables QR code and interactive features

# Start Expo in regular mode (same network) for backend access
# Use --tunnel only if device is on different network AND backend is also tunneled
bunx expo start "$@"

