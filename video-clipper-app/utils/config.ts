// Frontend configuration
// All settings should be configurable here, no hardcoded values in components

import { Platform } from 'react-native';

export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: {
      upload: number; // milliseconds
      clip: number; // milliseconds
      config: number; // milliseconds
    };
  };
  video: {
    thumbnail: {
      loadDelay: number; // milliseconds before starting thumbnail load
      playDuration: number; // milliseconds to play before pausing for thumbnail
      maxAttempts: number; // maximum retry attempts
      retryDelay: number; // milliseconds between retries
      fallbackTimeout: number; // milliseconds before fallback
    };
    player: {
      loop: boolean;
      muted: boolean;
      maintainThumbnailInterval: number; // milliseconds between thumbnail maintenance checks
    };
  };
  list: {
    removeClippedSubviews: boolean;
    maxToRenderPerBatch: number;
    windowSize: number;
    initialNumToRender: number;
    updateCellsBatchingPeriod: number;
    itemHeight: number; // approximate height for getItemLayout
    viewabilityThreshold: number; // percentage (0-100)
    minimumViewTime: number; // milliseconds
    drawDistance: number; // pixels to render outside viewport
  };
  processing: {
    progressUpdateInterval: number; // milliseconds
    uploadProgressInterval: number; // milliseconds
    clipProgressInterval: number; // milliseconds
  };
}

// API URL configuration
// Priority: EXPO_PUBLIC_API_URL env var > production default > dev default
// For production web deployments, EXPO_PUBLIC_API_URL should be set in EAS
const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  
  // Production default (for deployed web app)
  const productionUrl = 'https://tiktokbot-hcfnvg.fly.dev';
  
  // Development default (for local development)
  const devUrl = Platform.OS === 'web' 
    ? 'http://localhost:3000' 
    : 'http://192.168.40.29:3000';
  
  const defaultUrl = __DEV__ ? devUrl : productionUrl;
  const finalUrl = envUrl || defaultUrl;
  
  console.log('[API Config] EXPO_PUBLIC_API_URL:', envUrl);
  console.log('[API Config] Default URL:', defaultUrl);
  console.log('[API Config] Final API_BASE_URL:', finalUrl);
  console.log('[API Config] __DEV__:', __DEV__);
  console.log('[API Config] Platform:', Platform.OS);
  
  return finalUrl;
};

export const APP_CONFIG: AppConfig = {
  api: {
    baseUrl: getApiUrl(),
    timeout: {
      upload: 15 * 60 * 1000, // 15 minutes
      clip: 10 * 60 * 1000, // 10 minutes
      config: 5000, // 5 seconds
    },
  },
  video: {
    thumbnail: {
      loadDelay: 200, // milliseconds - delay before starting thumbnail load
      playDuration: 1500, // 1.5 seconds - how long to play before pausing
      maxAttempts: 5, // maximum retry attempts
      retryDelay: 500, // milliseconds between retries
      fallbackTimeout: 5000, // 5 seconds - timeout before fallback
    },
    player: {
      loop: false,
      muted: true,
      maintainThumbnailInterval: 1000, // 1 second
    },
  },
  list: {
    removeClippedSubviews: true,
    maxToRenderPerBatch: 2,
    windowSize: 3,
    initialNumToRender: 3,
    updateCellsBatchingPeriod: 100,
    itemHeight: 320,
    viewabilityThreshold: 80,
    minimumViewTime: 500,
    drawDistance: 250,
  },
  processing: {
    progressUpdateInterval: 100, // milliseconds
    uploadProgressInterval: 150, // milliseconds
    clipProgressInterval: 400, // milliseconds
  },
};

export const API_BASE_URL = APP_CONFIG.api.baseUrl;
