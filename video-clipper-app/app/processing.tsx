import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadVideo, generateClips } from '../utils/api';

export default function Processing() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('Uploading video...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    processVideo();
  }, []);

  const processVideo = async () => {
    try {
      console.log('[Processing] Starting video processing...');
      console.log('[Processing] Params:', JSON.stringify(params, null, 2));
      
      const { uri, fileName } = params;
      
      if (!uri || typeof uri !== 'string') {
        console.error('[Processing] Invalid URI:', uri);
        throw new Error('Invalid video URI');
      }

      console.log('[Processing] Video URI:', uri);
      console.log('[Processing] File name:', fileName);

      setStatus('Uploading video...');
      
      // Upload video
      console.log('[Processing] Calling uploadVideo...');
      const videoId = await uploadVideo(uri, fileName as string);
      console.log('[Processing] Upload successful, videoId:', videoId);
      
      setStatus('Analyzing video and generating clips...');
      
      // Generate clips (maxLength defaults to 15 in the function)
      console.log('[Processing] Calling generateClips...');
      const clips = await generateClips(videoId, 15);
      console.log('[Processing] Clips generated:', clips.length);
      
      // Navigate to results
      console.log('[Processing] Navigating to results...');
      router.replace({
        pathname: '/results',
        params: {
          videoId,
          clips: JSON.stringify(clips),
        },
      });
    } catch (err) {
      console.error('[Processing] Error in processVideo:', err);
      console.error('[Processing] Error type:', err?.constructor?.name);
      console.error('[Processing] Error message:', err?.message);
      console.error('[Processing] Error stack:', err?.stack);
      setError(err instanceof Error ? err.message : 'Failed to process video');
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.statusText}>{status}</Text>
      <Text style={styles.hintText}>This may take a few moments...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  statusText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  hintText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
});

