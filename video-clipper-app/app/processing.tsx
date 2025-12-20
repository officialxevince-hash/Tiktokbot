import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadVideo, generateClips } from '../utils/api';

interface ProcessingState {
  phase: 'upload' | 'clipping' | 'complete';
  progress: number;
  status: string;
  details?: string;
  timeElapsed?: number;
}

export default function Processing() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [state, setState] = useState<ProcessingState>({
    phase: 'upload',
    progress: 0,
    status: 'Uploading video...',
  });
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{
    uploadTime?: number;
    clipTime?: number;
    totalTime?: number;
    clipCount?: number;
  }>({});

  useEffect(() => {
    processVideo();
  }, []);

  const processVideo = async () => {
    const totalStartTime = performance.now();
    try {
      console.log(`[Processing] ⏱️  START - ${new Date().toISOString()}`);
      console.log('[Processing] Params:', JSON.stringify(params, null, 2));
      
      const { uri, fileName } = params;
      
      if (!uri || typeof uri !== 'string') {
        console.error('[Processing] Invalid URI:', uri);
        throw new Error('Invalid video URI');
      }

      console.log('[Processing] Video URI:', uri);
      console.log('[Processing] File name:', fileName);

      // Upload phase
      setState({
        phase: 'upload',
        progress: 0,
        status: 'Uploading video...',
        details: 'Transferring to server',
      });
      
      const uploadStart = performance.now();
      console.log('[Processing] Calling uploadVideo...');
      const videoId = await uploadVideo(uri, fileName as string);
      const uploadTime = parseFloat(((performance.now() - uploadStart) / 1000).toFixed(2));
      console.log(`[Processing] ✓ Upload completed in ${uploadTime}s`);
      console.log('[Processing] Video ID:', videoId);
      
      setMetrics(prev => ({ ...prev, uploadTime }));
      setState({
        phase: 'clipping',
        progress: 50,
        status: 'Generating clips...',
        details: 'Processing video segments',
        timeElapsed: uploadTime,
      });
      
      // Clipping phase
      const clipsStart = performance.now();
      console.log('[Processing] Calling generateClips...');
      const clips = await generateClips(videoId, 15);
      const clipsTime = parseFloat(((performance.now() - clipsStart) / 1000).toFixed(2));
      console.log(`[Processing] ✓ Clips generated in ${clipsTime}s`);
      console.log('[Processing] Total clips:', clips.length);
      
      const totalTime = parseFloat(((performance.now() - totalStartTime) / 1000).toFixed(2));
      setMetrics({
        uploadTime,
        clipTime: clipsTime,
        totalTime,
        clipCount: clips.length,
      });
      
      setState({
        phase: 'complete',
        progress: 100,
        status: 'Complete!',
        details: `${clips.length} clips generated`,
        timeElapsed: totalTime,
      });
      
      // Small delay to show completion, then navigate
      setTimeout(() => {
        console.log(`[Processing] ✅ COMPLETE - Total processing time: ${totalTime}s`);
        router.replace({
          pathname: '/results',
          params: {
            videoId,
            clips: JSON.stringify(clips),
            metrics: JSON.stringify({ uploadTime, clipTime: clipsTime, totalTime }),
          },
        });
      }, 500);
    } catch (err) {
      const totalTime = ((performance.now() - totalStartTime) / 1000).toFixed(3);
      console.error(`[Processing] ❌ ERROR after ${totalTime}s:`, err);
      console.error('[Processing] Error type:', err?.constructor?.name);
      if (err instanceof Error) {
        console.error('[Processing] Error message:', err.message);
        console.error('[Processing] Error stack:', err.stack);
        setError(err.message);
      } else {
        setError('Failed to process video');
      }
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Processing Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              setState({ phase: 'upload', progress: 0, status: 'Uploading video...' });
              processVideo();
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#007AFF" />
        
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>{state.status}</Text>
          {state.details && (
            <Text style={styles.detailsText}>{state.details}</Text>
          )}
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${state.progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(state.progress)}%</Text>
        </View>

        {/* Metrics */}
        {metrics.uploadTime && (
          <View style={styles.metricsContainer}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Upload</Text>
              <Text style={styles.metricValue}>{metrics.uploadTime}s</Text>
            </View>
            {metrics.clipTime && (
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Clipping</Text>
                <Text style={styles.metricValue}>{metrics.clipTime}s</Text>
              </View>
            )}
            {metrics.totalTime && (
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Total</Text>
                <Text style={styles.metricValue}>{metrics.totalTime}s</Text>
              </View>
            )}
          </View>
        )}

        {state.phase === 'upload' && (
          <Text style={styles.hintText}>Uploading video file...</Text>
        )}
        {state.phase === 'clipping' && (
          <Text style={styles.hintText}>Analyzing and generating clips...</Text>
        )}
      </View>
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
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  statusContainer: {
    marginTop: 30,
    alignItems: 'center',
    marginBottom: 30,
  },
  statusText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 30,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
    paddingVertical: 15,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
  },
  hintText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 10,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 30,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

