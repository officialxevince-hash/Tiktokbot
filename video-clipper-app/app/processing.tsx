import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadVideo, generateClips } from '../utils/api';

interface ProcessingState {
  phase: 'upload' | 'clipping' | 'complete';
  progress: number;
  status: string;
  details?: string;
  timeElapsed?: number;
  clipsGenerated?: number;
  totalClips?: number;
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
  const [elapsedTime, setElapsedTime] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    processVideo();
    
    // Start elapsed time counter
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 0.1);
    }, 100);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, []);

  // Animate progress bar smoothly
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: state.progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [state.progress]);

  const simulateUploadProgress = () => {
    let currentProgress = 0;
    const statusMessages = [
      'Preparing video...',
      'Uploading to server...',
      'Transferring data...',
      'Finalizing upload...',
    ];
    let messageIndex = 0;
    
    intervalRef.current = setInterval(() => {
      currentProgress += Math.random() * 2.5 + 1.5; // 1.5-4% per update
      if (currentProgress >= 45) {
        currentProgress = 45; // Cap at 45% during upload
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
      
      // Update status message based on progress
      const newMessageIndex = Math.floor((currentProgress / 45) * statusMessages.length);
      if (newMessageIndex !== messageIndex && newMessageIndex < statusMessages.length) {
        messageIndex = newMessageIndex;
      }
      
      setState(prev => ({
        ...prev,
        progress: Math.min(currentProgress, 45),
        details: statusMessages[messageIndex],
      }));
    }, 150); // Update every 150ms for faster feel
  };

  const simulateClipProgress = (totalClips: number) => {
    let currentProgress = 50;
    let clipsGenerated = 0;
    const statusMessages = [
      'Analyzing video content...',
      'Detecting scene changes...',
      'Generating clips...',
      'Processing segments...',
      'Optimizing clips...',
    ];
    let messageIndex = 0;
    
    intervalRef.current = setInterval(() => {
      clipsGenerated += 1;
      currentProgress = 50 + (clipsGenerated / totalClips) * 45; // 50% to 95%
      
      // Rotate status messages
      if (clipsGenerated % 2 === 0) {
        messageIndex = (messageIndex + 1) % statusMessages.length;
      }
      
      if (clipsGenerated >= totalClips) {
        currentProgress = 95;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
      
      setState(prev => ({
        ...prev,
        progress: Math.min(currentProgress, 95),
        clipsGenerated,
        totalClips,
        details: clipsGenerated < totalClips 
          ? `${statusMessages[messageIndex]} (${clipsGenerated}/${totalClips})`
          : 'Finalizing clips...',
      }));
    }, 400); // Update every 400ms for faster feel
  };

  const processVideo = async () => {
    const totalStartTime = performance.now();
    setElapsedTime(0);
    
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

      // Upload phase with simulated progress
      setState({
        phase: 'upload',
        progress: 0,
        status: 'Uploading video...',
        details: 'Preparing upload...',
      });
      
      simulateUploadProgress();
      
      const uploadStart = performance.now();
      console.log('[Processing] Calling uploadVideo...');
      const videoId = await uploadVideo(uri, fileName as string);
      const uploadTime = parseFloat(((performance.now() - uploadStart) / 1000).toFixed(2));
      console.log(`[Processing] ✓ Upload completed in ${uploadTime}s`);
      console.log('[Processing] Video ID:', videoId);
      
      // Clear upload interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      setMetrics(prev => ({ ...prev, uploadTime }));
      setState({
        phase: 'clipping',
        progress: 50,
        status: 'Generating clips...',
        details: 'Analyzing video...',
        timeElapsed: uploadTime,
      });
      
      // Clipping phase with simulated progress
      const clipsStart = performance.now();
      console.log('[Processing] Calling generateClips...');
      
      // Estimate clip count based on video duration (if available)
      const duration = params.duration ? parseFloat(params.duration as string) : 180;
      const estimatedClips = Math.ceil(duration / 15);
      simulateClipProgress(estimatedClips);
      
      const clips = await generateClips(videoId, 15);
      const clipsTime = parseFloat(((performance.now() - clipsStart) / 1000).toFixed(2));
      console.log(`[Processing] ✓ Clips generated in ${clipsTime}s`);
      console.log('[Processing] Total clips:', clips.length);
      
      // Clear clip interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
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
        clipsGenerated: clips.length,
        totalClips: clips.length,
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
      }, 800);
    } catch (err) {
      // Clear intervals on error
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
            <Animated.View 
              style={[
                styles.progressFill, 
                { 
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  })
                }
              ]} 
            />
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>{Math.round(state.progress)}%</Text>
            {state.clipsGenerated !== undefined && state.totalClips !== undefined && (
              <Text style={styles.clipCountText}>
                {state.clipsGenerated}/{state.totalClips} clips
              </Text>
            )}
          </View>
        </View>

        {/* Elapsed Time */}
        <Text style={styles.elapsedTime}>
          {elapsedTime.toFixed(1)}s elapsed
        </Text>

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
    </SafeAreaView>
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
    marginBottom: 20,
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#E5E5E5',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 5,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  clipCountText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  elapsedTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 20,
    fontWeight: '500',
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

