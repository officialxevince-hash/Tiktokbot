import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL } from './config';

export interface Clip {
  id: string;
  url: string;
  duration: number;
}

export async function uploadVideo(uri: string, fileName: string): Promise<string> {
  console.log('[uploadVideo] Starting upload...');
  console.log('[uploadVideo] File URI:', uri);
  console.log('[uploadVideo] File name:', fileName);
  console.log('[uploadVideo] API_BASE_URL:', API_BASE_URL);
  
  const formData = new FormData();
  
  try {
    // Get file info
    console.log('[uploadVideo] Getting file info...');
    const fileInfo = await FileSystem.getInfoAsync(uri);
    console.log('[uploadVideo] File info:', JSON.stringify(fileInfo, null, 2));
    
    if (!fileInfo.exists) {
      console.error('[uploadVideo] File does not exist!');
      throw new Error('Video file not found');
    }

    // Determine file type from extension
    const extension = fileName.split('.').pop()?.toLowerCase();
    const mimeType = extension === 'mov' ? 'video/quicktime' : 
                     extension === 'mp4' ? 'video/mp4' :
                     'video/mp4'; // Default
    
    console.log('[uploadVideo] MIME type:', mimeType);
    
    // React Native FormData format
    formData.append('file', {
      uri: fileInfo.uri,
      type: mimeType,
      name: fileName,
    } as any);

    const uploadUrl = `${API_BASE_URL}/upload`;
    console.log('[uploadVideo] Upload URL:', uploadUrl);
    console.log('[uploadVideo] Making fetch request...');

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let fetch set it with boundary
    });

    console.log('[uploadVideo] Response status:', response.status);
    console.log('[uploadVideo] Response ok:', response.ok);
    console.log('[uploadVideo] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

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
    console.log('[uploadVideo] Upload successful, videoId:', data.videoId);
    return data.videoId;
  } catch (error) {
    console.error('[uploadVideo] Error details:', error);
    console.error('[uploadVideo] Error type:', error?.constructor?.name);
    console.error('[uploadVideo] Error message:', error?.message);
    console.error('[uploadVideo] Error stack:', error?.stack);
    throw error;
  }
}

export async function generateClips(videoId: string, maxLength: number = 15): Promise<Clip[]> {
  console.log('[generateClips] Starting clip generation...');
  console.log('[generateClips] Video ID:', videoId);
  console.log('[generateClips] Max length:', maxLength);
  console.log('[generateClips] API_BASE_URL:', API_BASE_URL);
  
  try {
    const clipUrl = `${API_BASE_URL}/clip`;
    console.log('[generateClips] Clip URL:', clipUrl);
    
    const requestBody = {
      videoId,
      maxLength,
    };
    console.log('[generateClips] Request body:', JSON.stringify(requestBody, null, 2));
    console.log('[generateClips] Making fetch request...');

    const response = await fetch(clipUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

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
    console.log('[generateClips] Clips generated:', data.clips?.length || 0);
    console.log('[generateClips] Clips data:', JSON.stringify(data, null, 2));
    return data.clips;
  } catch (error) {
    console.error('[generateClips] Error details:', error);
    console.error('[generateClips] Error type:', error?.constructor?.name);
    console.error('[generateClips] Error message:', error?.message);
    console.error('[generateClips] Error stack:', error?.stack);
    throw error;
  }
}

