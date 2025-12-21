import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { API_BASE_URL, APP_CONFIG } from './config';

export interface Clip {
  id: string;
  url: string;
  thumbnail_url: string;
  duration: number;
}

export interface BackendConfig {
  max_concurrent_clips: number;
  max_file_size: number;
  max_concurrent_videos: number;
  system_info: {
    cpus: number;
    memory_free_gb: number;
    memory_total_gb: number;
  };
}

// Helper function to fetch with timeout
const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timeout after ${timeoutMs / 1000}s. The server may still be processing.`));
    }, timeoutMs);
  });
  
  try {
    const response = await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      timeoutPromise,
    ]);
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return response;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (error instanceof Error && (error.message.includes('aborted') || error.message.includes('timeout'))) {
      throw new Error(`Request timeout after ${timeoutMs / 1000}s. The server may still be processing.`);
    }
    throw error;
  }
};

export async function uploadVideo(uri: string, fileName: string): Promise<string> {
  const startTime = performance.now();
  console.log(`[uploadVideo] ⏱️  START - ${new Date().toISOString()}`);
  console.log('[uploadVideo] File URI:', uri);
  console.log('[uploadVideo] File name:', fileName);
  console.log('[uploadVideo] API_BASE_URL:', API_BASE_URL);
  
  const formData = new FormData();
  
  try {
    // Determine file type from extension
    const extension = fileName.split('.').pop()?.toLowerCase();
    const mimeType = extension === 'mov' ? 'video/quicktime' : 
                     extension === 'mp4' ? 'video/mp4' :
                     'video/mp4'; // Default
    
    console.log('[uploadVideo] MIME type:', mimeType);
    console.log('[uploadVideo] Platform:', Platform.OS);
    
    // Handle web vs native platforms differently
    if (Platform.OS === 'web') {
      // Web: Fetch the file as a Blob and append directly
      console.log('[uploadVideo] Web platform - fetching file as Blob...');
      const fileInfoStart = performance.now();
      
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error('Failed to fetch video file');
      }
      
      const blob = await response.blob();
      const fileInfoTime = ((performance.now() - fileInfoStart) / 1000).toFixed(3);
      console.log(`[uploadVideo] ✓ File fetched in ${fileInfoTime}s`);
      
      // Append Blob directly to FormData (web format)
      formData.append('file', blob, fileName);
    } else {
      // Native: Use FileSystem to get file info
      const fileInfoStart = performance.now();
      console.log('[uploadVideo] Getting file info...');
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const fileInfoTime = ((performance.now() - fileInfoStart) / 1000).toFixed(3);
      console.log(`[uploadVideo] ✓ File info retrieved in ${fileInfoTime}s`);
      console.log('[uploadVideo] File info:', JSON.stringify(fileInfo, null, 2));
      
      if (!fileInfo.exists) {
        console.error('[uploadVideo] File does not exist!');
        throw new Error('Video file not found');
      }
      
      // React Native FormData format
      formData.append('file', {
        uri: fileInfo.uri,
        type: mimeType,
        name: fileName,
      } as any);
    }

    const uploadUrl = `${API_BASE_URL}/upload`;
    console.log('[uploadVideo] Upload URL:', uploadUrl);
    
    const uploadStart = performance.now();
    console.log(`[uploadVideo] Making fetch request with ${APP_CONFIG.api.timeout.upload / 1000 / 60} minute timeout...`);

    // Use fetchWithTimeout for uploads (large files can take a while)
    const response = await fetchWithTimeout(
      uploadUrl,
      {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - let fetch set it with boundary
      },
      APP_CONFIG.api.timeout.upload
    );

    const uploadTime = ((performance.now() - uploadStart) / 1000).toFixed(3);
    console.log(`[uploadVideo] ✓ Upload completed in ${uploadTime}s`);
    console.log('[uploadVideo] Response status:', response.status);
    console.log('[uploadVideo] Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[uploadVideo] Response error text:', errorText);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: errorText || 'Upload failed' };
      }
      throw new Error(error.error || 'Failed to upload video');
    }

    const data = await response.json();
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
    console.log(`[uploadVideo] ✅ SUCCESS - Total time: ${totalTime}s`);
    // Backend returns snake_case: video_id
    const videoId = data.video_id || data.videoId;
    console.log('[uploadVideo] Video ID:', videoId);
    return videoId;
  } catch (error) {
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
    console.error(`[uploadVideo] ❌ ERROR after ${totalTime}s:`, error);
    console.error('[uploadVideo] Error type:', error?.constructor?.name);
    if (error instanceof Error) {
      console.error('[uploadVideo] Error message:', error.message);
      console.error('[uploadVideo] Error stack:', error.stack);
    }
    throw error;
  }
}

export async function generateClips(videoId: string, maxLength: number = 15): Promise<Clip[]> {
  const startTime = performance.now();
  console.log(`[generateClips] ⏱️  START - ${new Date().toISOString()}`);
  console.log('[generateClips] Video ID:', videoId);
  console.log('[generateClips] Max length:', maxLength);
  console.log('[generateClips] API_BASE_URL:', API_BASE_URL);
  
  try {
    const clipUrl = `${API_BASE_URL}/clip`;
    console.log('[generateClips] Clip URL:', clipUrl);
    
    // Backend expects snake_case: video_id and max_length
    const requestBody = {
      video_id: videoId,
      max_length: maxLength,
    };
    console.log('[generateClips] Request body:', JSON.stringify(requestBody, null, 2));
    
    const requestStart = performance.now();
    console.log(`[generateClips] Making fetch request with ${APP_CONFIG.api.timeout.clip / 1000 / 60} minute timeout...`);

    // Use fetchWithTimeout for clip generation (can take a while for large videos)
    const response = await fetchWithTimeout(
      clipUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      APP_CONFIG.api.timeout.clip
    );

    const requestTime = ((performance.now() - requestStart) / 1000).toFixed(3);
    console.log(`[generateClips] ✓ Request completed in ${requestTime}s`);
    console.log('[generateClips] Response status:', response.status);
    console.log('[generateClips] Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generateClips] Response error text:', errorText);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: errorText || 'Clipping failed' };
      }
      throw new Error(error.error || 'Failed to generate clips');
    }

    const data = await response.json();
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
    console.log(`[generateClips] ✅ SUCCESS - Total time: ${totalTime}s`);
    console.log('[generateClips] Clips generated:', data.clips?.length || 0);
    return data.clips;
  } catch (error) {
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
    console.error(`[generateClips] ❌ ERROR after ${totalTime}s:`, error);
    console.error('[generateClips] Error type:', error?.constructor?.name);
    if (error instanceof Error) {
      console.error('[generateClips] Error message:', error.message);
      console.error('[generateClips] Error stack:', error.stack);
    }
    throw error;
  }
}

export async function getConfig(): Promise<BackendConfig> {
  const startTime = performance.now();
  console.log(`[getConfig] ⏱️  START - ${new Date().toISOString()}`);
  console.log('[getConfig] API_BASE_URL:', API_BASE_URL);
  
  try {
    const configUrl = `${API_BASE_URL}/config`;
    console.log('[getConfig] Config URL:', configUrl);
    
    const response = await fetchWithTimeout(
      configUrl,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      APP_CONFIG.api.timeout.config
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[getConfig] Response error text:', errorText);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: errorText || 'Failed to get config' };
      }
      throw new Error(error.error || 'Failed to get backend configuration');
    }

    const data = await response.json();
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
    console.log(`[getConfig] ✅ SUCCESS - Total time: ${totalTime}s`);
    console.log('[getConfig] Config:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
    console.error(`[getConfig] ❌ ERROR after ${totalTime}s:`, error);
    if (error instanceof Error) {
      console.error('[getConfig] Error message:', error.message);
      console.error('[getConfig] Error stack:', error.stack);
    }
    throw error;
  }
}

