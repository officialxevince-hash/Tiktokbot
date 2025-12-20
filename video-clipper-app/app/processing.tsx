import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadVideo, generateClips, Clip } from '../utils/api';

interface VideoItem {
  uri: string;
  duration: string;
  fileName: string;
}

interface ProcessingState {
  phase: 'upload' | 'clipping' | 'complete';
  progress: number;
  status: string;
  details?: string;
  timeElapsed?: number;
  clipsGenerated?: number;
  totalClips?: number;
  currentVideoIndex?: number;
  totalVideos?: number;
  currentVideoName?: string;
}

interface ProcessedVideo {
  videoId: string;
  clips: Clip[];
  metrics: {
    uploadTime: number;
    clipTime: number;
    totalTime: number;
  };
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
  const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([]);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoQueueRef = useRef<VideoItem[]>([]);
  const currentIndexRef = useRef(0);

  useEffect(() => {
    // Parse video queue from params
    const videosParam = params.videos as string;
    const currentIndex = parseInt(params.currentIndex as string || '0', 10);
    const totalVideos = parseInt(params.totalVideos as string || '1', 10);
    
    if (videosParam) {
      try {
        const videos = JSON.parse(videosParam) as VideoItem[];
        videoQueueRef.current = videos;
        currentIndexRef.current = currentIndex;
        
        if (videos.length > 0) {
          setState(prev => ({
            ...prev,
            currentVideoIndex: currentIndex + 1,
            totalVideos: videos.length,
            currentVideoName: videos[currentIndex]?.fileName || 'video',
          }));
        }
      } catch (e) {
        console.error('[Processing] Failed to parse videos:', e);
      }
    }
    
    processVideoQueue();
    
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

  const processVideoQueue = async () => {
    const videos = videoQueueRef.current;
    
    if (videos.length === 0) {
      // Fallback to single video mode for backward compatibility
      const { uri, fileName } = params;
      if (uri && typeof uri === 'string') {
        await processSingleVideo({ uri, duration: params.duration as string || '0', fileName: fileName as string || 'video.mp4' }, true);
      } else {
        setError('No videos to process');
      }
      return;
    }
    
    // Process all videos in queue sequentially
    for (let i = 0; i < videos.length; i++) {
      currentIndexRef.current = i;
      const video = videos[i];
      
      setState(prev => ({
        ...prev,
        currentVideoIndex: i + 1,
        totalVideos: videos.length,
        currentVideoName: video.fileName,
      }));
      
      try {
        const isLastVideo = i === videos.length - 1;
        await processSingleVideo(video, isLastVideo);
      } catch (err) {
        console.error(`[Processing] Error processing video ${i + 1}:`, err);
        // Continue with next video even if one fails
        if (i === videos.length - 1) {
          // Last video failed, show error
          if (err instanceof Error) {
            setError(`Failed to process video ${i + 1}: ${err.message}`);
          } else {
            setError(`Failed to process video ${i + 1}`);
          }
          return;
        }
        // Continue to next video on error
        continue;
      }
    }
    
    // All videos processed - navigate to results of last video
    if (processedVideos.length > 0) {
      const lastVideo = processedVideos[processedVideos.length - 1];
      router.replace({
        pathname: '/results',
        params: {
          videoId: lastVideo.videoId,
          clips: JSON.stringify(lastVideo.clips),
          metrics: JSON.stringify(lastVideo.metrics),
        },
      });
    }
  };

  const processSingleVideo = async (video: VideoItem, isLastVideo: boolean = true) => {
    const totalStartTime = performance.now();
    setElapsedTime(0);
    
    try {
      console.log(`[Processing] ⏱️  START - ${new Date().toISOString()}`);
      console.log('[Processing] Video:', video.fileName);
      
      const { uri, fileName } = video;
      
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
      const videoMetrics = {
        uploadTime,
        clipTime: clipsTime,
        totalTime,
        clipCount: clips.length,
      };
      
      setMetrics(videoMetrics);
      
      // Store processed video
      const processedVideo: ProcessedVideo = {
        videoId,
        clips,
        metrics: { uploadTime, clipTime: clipsTime, totalTime },
      };
      setProcessedVideos(prev => [...prev, processedVideo]);
      
      const hasMultipleVideos = videoQueueRef.current.length > 1;
      
      setState({
        phase: 'complete',
        progress: 100,
        status: isLastVideo && hasMultipleVideos ? 'All videos complete!' : 'Video complete!',
        details: `${clips.length} clips generated${hasMultipleVideos && !isLastVideo ? ` (${currentIndexRef.current + 1}/${videoQueueRef.current.length})` : ''}`,
        timeElapsed: totalTime,
        clipsGenerated: clips.length,
        totalClips: clips.length,
      });
      
      // If single video or last video, navigate to results after delay
      if (videoQueueRef.current.length === 1 || isLastVideo) {
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
      } else {
        // Brief delay before continuing to next video (handled by loop in processVideoQueue)
        await new Promise(resolve => setTimeout(resolve, 1000));
        setState({
          phase: 'upload',
          progress: 0,
          status: 'Uploading next video...',
          details: 'Preparing upload...',
        });
      }
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
              processVideoQueue();
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
          {state.currentVideoIndex && state.totalVideos && state.totalVideos > 1 && (
            <Text style={styles.videoCounter}>
              Video {state.currentVideoIndex} of {state.totalVideos}
            </Text>
          )}
          {state.currentVideoName && (
            <Text style={styles.videoName} numberOfLines={1}>
              {state.currentVideoName}
            </Text>
          )}
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
  videoCounter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  videoName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    maxWidth: '90%',
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

