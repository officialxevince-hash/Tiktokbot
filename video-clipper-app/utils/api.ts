import * as FileSystem from 'expo-file-system';
import { API_BASE_URL } from './config';

export interface Clip {
  id: string;
  url: string;
  duration: number;
}

export async function uploadVideo(uri: string, fileName: string): Promise<string> {
  const formData = new FormData();
  
  // Get file info
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) {
    throw new Error('Video file not found');
  }

  // Determine file type from extension
  const extension = fileName.split('.').pop()?.toLowerCase();
  const mimeType = extension === 'mov' ? 'video/quicktime' : 
                   extension === 'mp4' ? 'video/mp4' :
                   'video/mp4'; // Default
  
  // React Native FormData format
  formData.append('file', {
    uri: fileInfo.uri,
    type: mimeType,
    name: fileName,
  } as any);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - let fetch set it with boundary
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload video');
  }

  const data = await response.json();
  return data.videoId;
}

export async function generateClips(videoId: string, maxLength: number = 15): Promise<Clip[]> {
  const response = await fetch(`${API_BASE_URL}/clip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      videoId,
      maxLength,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Clipping failed' }));
    throw new Error(error.error || 'Failed to generate clips');
  }

  const data = await response.json();
  return data.clips;
}

