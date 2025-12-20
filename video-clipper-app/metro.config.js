const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable Watchman - Metro will use Node file watcher instead
// This prevents permission errors on macOS
process.env.WATCHMAN_DISABLE_FILE_WATCHING = '1';

module.exports = config;
