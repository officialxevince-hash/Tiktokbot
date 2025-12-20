import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated, ScrollView, AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { uploadVideo, generateClips, getConfig, Clip, BackendConfig } from '../utils/api';
import { APP_CONFIG } from '../utils/config';

interface VideoItem {
  uri: string;
  duration: string;
  fileName: string;
}

type VideoStatus = 'queued' | 'uploading' | 'clipping' | 'complete' | 'error';

interface VideoQueueItem {
  video: VideoItem;
  index: number;
  status: VideoStatus;
  progress: number;
  videoId?: string;
  clips?: Clip[];
  metrics?: {
    uploadTime: number;
    clipTime: number;
    totalTime: number;
  };
  error?: string;
  details?: string;
  clipsGenerated?: number;
  totalClips?: number;
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

// Maximum concurrent video processing - will be set from backend config
let MAX_CONCURRENT_VIDEOS = 2; // Default fallback

export default function Processing() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [videoQueue, setVideoQueue] = useState<VideoQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([]);
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null);
  const progressAnimsRef = useRef<Map<number, Animated.Value>>(new Map());
  const intervalRefsRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingRef = useRef<Set<number>>(new Set()); // Track which videos are currently processing
  const queueRef = useRef<VideoQueueItem[]>([]); // Keep ref of latest queue for processing logic
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundKeepAliveRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Fetch backend configuration first
    const fetchConfig = async () => {
      try {
        console.log('[Processing] Fetching backend configuration...');
        const config = await getConfig();
        setBackendConfig(config);
        // Update the global MAX_CONCURRENT_VIDEOS from backend
        MAX_CONCURRENT_VIDEOS = config.max_concurrent_videos;
        console.log('[Processing] Backend config loaded:', {
          max_concurrent_videos: config.max_concurrent_videos,
          max_concurrent_clips: config.max_concurrent_clips,
          cpus: config.system_info.cpus,
        });
      } catch (err) {
        console.error('[Processing] Failed to fetch backend config:', err);
        // Continue with default value
        console.warn('[Processing] Using default MAX_CONCURRENT_VIDEOS:', MAX_CONCURRENT_VIDEOS);
      }
    };

    fetchConfig();

    // Parse video queue from params
    const videosParam = params.videos as string;
    
    if (videosParam) {
      try {
        const videos = JSON.parse(videosParam) as VideoItem[];
        const queueItems: VideoQueueItem[] = videos.map((video, index) => ({
          video,
          index,
          status: 'queued' as VideoStatus,
          progress: 0,
        }));
        setVideoQueue(queueItems);
        queueRef.current = queueItems; // Update ref
        
        // Initialize progress animations for each video
        queueItems.forEach((item) => {
          progressAnimsRef.current.set(item.index, new Animated.Value(0));
        });
      } catch (e) {
        console.error('[Processing] Failed to parse videos:', e);
        setError('Failed to parse video queue');
      }
    } else {
      // Fallback to single video mode
      const { uri, fileName } = params;
      if (uri && typeof uri === 'string') {
        const queueItems: VideoQueueItem[] = [{
          video: { uri, duration: params.duration as string || '0', fileName: fileName as string || 'video.mp4' },
          index: 0,
          status: 'queued' as VideoStatus,
          progress: 0,
        }];
        setVideoQueue(queueItems);
        queueRef.current = queueItems; // Update ref
        progressAnimsRef.current.set(0, new Animated.Value(0));
      } else {
        setError('No videos to process');
      }
    }
    
    // Start elapsed time counter
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 0.1);
    }, APP_CONFIG.processing.progressUpdateInterval);

    // Handle app state changes to prevent cleanup during processing
    const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log('[Processing] App state changed:', appStateRef.current, '->', nextAppState);
      
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[Processing] App returned to foreground - resuming processing');
        // Resume processing if there are queued items
        const hasQueued = queueRef.current.some(item => 
          item.status === 'queued' && !processingRef.current.has(item.index)
        );
        const hasSlots = processingRef.current.size < MAX_CONCURRENT_VIDEOS;
        
        if (hasQueued && hasSlots) {
          processVideoQueue();
        }
      } else if (
        appStateRef.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        console.log('[Processing] App going to background - keeping processing alive');
        // Keep processing alive in background
        if (backgroundKeepAliveRef.current) {
          clearInterval(backgroundKeepAliveRef.current);
        }
        
        backgroundKeepAliveRef.current = setInterval(() => {
          // Ensure processing continues
          if (processingRef.current.size > 0) {
            console.log('[Processing] Background: Active processing ongoing');
          }
        }, 30000);
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      intervalRefsRef.current.forEach(interval => clearInterval(interval));
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      if (backgroundKeepAliveRef.current) clearInterval(backgroundKeepAliveRef.current);
      appStateSubscription.remove();
    };
  }, []);

  // Start processing videos when queue is ready or when videos complete
  useEffect(() => {
    // Wait for config to be loaded before processing
    if (videoQueue.length > 0 && backendConfig) {
      // Check if there are queued videos that aren't being processed
      const hasQueued = videoQueue.some(item => 
        item.status === 'queued' && !processingRef.current.has(item.index)
      );
      const hasSlots = processingRef.current.size < MAX_CONCURRENT_VIDEOS;
      
      if (hasQueued && hasSlots) {
        processVideoQueue();
      }
    }
  }, [videoQueue.map(v => `${v.index}-${v.status}`).join(','), backendConfig]);

  // Animate progress bars smoothly
  useEffect(() => {
    videoQueue.forEach((item) => {
      const anim = progressAnimsRef.current.get(item.index);
      if (anim) {
        Animated.timing(anim, {
          toValue: item.progress,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
    });
  }, [videoQueue.map(v => v.progress).join(',')]);

  const updateVideoStatus = (index: number, updates: Partial<VideoQueueItem>) => {
    setVideoQueue(prev => {
      const updated = prev.map(item => 
        item.index === index ? { ...item, ...updates } : item
      );
      queueRef.current = updated; // Update ref
      
      // If a video just completed, trigger processing of next video
      if (updates.status === 'complete' || updates.status === 'error') {
        // Use setTimeout to ensure state is updated before checking
        setTimeout(() => {
          const hasQueued = queueRef.current.some(item => 
            item.status === 'queued' && !processingRef.current.has(item.index)
          );
          const hasSlots = processingRef.current.size < MAX_CONCURRENT_VIDEOS;
          
          if (hasQueued && hasSlots) {
            processVideoQueue();
          }
        }, 100);
      }
      
      return updated;
    });
  };

  const simulateUploadProgress = (index: number) => {
    let currentProgress = 0;
    const statusMessages = [
      'Preparing video...',
      'Uploading to server...',
      'Transferring data...',
      'Finalizing upload...',
    ];
    let messageIndex = 0;
    
    const interval = setInterval(() => {
      currentProgress += Math.random() * 2.5 + 1.5; // 1.5-4% per update
      if (currentProgress >= 45) {
        currentProgress = 45; // Cap at 45% during upload
        clearInterval(interval);
        intervalRefsRef.current.delete(index);
      }
      
      // Update status message based on progress
      const newMessageIndex = Math.floor((currentProgress / 45) * statusMessages.length);
      if (newMessageIndex !== messageIndex && newMessageIndex < statusMessages.length) {
        messageIndex = newMessageIndex;
      }
      
      updateVideoStatus(index, {
        progress: Math.min(currentProgress, 45),
        details: statusMessages[messageIndex],
      });
    }, APP_CONFIG.processing.uploadProgressInterval);
    
    intervalRefsRef.current.set(index, interval);
  };

  const simulateClipProgress = (index: number, totalClips: number) => {
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
    
    const interval = setInterval(() => {
      clipsGenerated += 1;
      currentProgress = 50 + (clipsGenerated / totalClips) * 45; // 50% to 95%
      
      // Rotate status messages
      if (clipsGenerated % 2 === 0) {
        messageIndex = (messageIndex + 1) % statusMessages.length;
      }
      
      if (clipsGenerated >= totalClips) {
        currentProgress = 95;
        clearInterval(interval);
        intervalRefsRef.current.delete(index);
      }
      
      updateVideoStatus(index, {
        progress: Math.min(currentProgress, 95),
        clipsGenerated,
        totalClips,
        details: clipsGenerated < totalClips 
          ? `${statusMessages[messageIndex]} (${clipsGenerated}/${totalClips})`
          : 'Finalizing clips...',
      });
    }, APP_CONFIG.processing.clipProgressInterval);
    
    intervalRefsRef.current.set(index, interval);
  };

  const processVideoQueue = () => {
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;

    // Process videos with controlled concurrency
    const processNext = () => {
      const latestQueue = queueRef.current;
      
      // Find next queued video that's not being processed
      const nextVideo = latestQueue.find(
        item => item.status === 'queued' && !processingRef.current.has(item.index)
      );
      
      if (!nextVideo) {
        // Check if all videos are done
        const allComplete = latestQueue.every(item => 
          item.status === 'complete' || item.status === 'error'
        );
        
        if (allComplete) {
          setProcessedVideos(prevVideos => {
            if (prevVideos.length > 0) {
              // Navigate to results of last video
              const lastVideo = prevVideos[prevVideos.length - 1];
              setTimeout(() => {
                router.replace({
                  pathname: '/results',
                  params: {
                    videoId: lastVideo.videoId,
                    clips: JSON.stringify(lastVideo.clips),
                    metrics: JSON.stringify(lastVideo.metrics),
                  },
                });
              }, 1000);
            }
            return prevVideos;
          });
        }
        return;
      }

      // Mark as processing
      processingRef.current.add(nextVideo.index);
      updateVideoStatus(nextVideo.index, { status: 'uploading' });

      // Process video (don't await - allows concurrent processing)
      processSingleVideo(nextVideo.index).finally(() => {
        processingRef.current.delete(nextVideo.index);
        // Process next video after a brief delay
        setTimeout(processNext, 100);
      });
    };

    // Start processing up to MAX_CONCURRENT_VIDEOS videos
    const queuedCount = currentQueue.filter(item => item.status === 'queued').length;
    const activeCount = processingRef.current.size;
    const slotsAvailable = MAX_CONCURRENT_VIDEOS - activeCount;
    
    for (let i = 0; i < Math.min(slotsAvailable, queuedCount); i++) {
      processNext();
    }
  };

  const processSingleVideo = async (index: number) => {
    const queueItem = queueRef.current.find(item => item.index === index);
    if (!queueItem) return;

    const totalStartTime = performance.now();
    const { video } = queueItem;
    
    try {
      console.log(`[Processing] ⏱️  START Video ${index + 1} - ${new Date().toISOString()}`);
      console.log('[Processing] Video:', video.fileName);
      
      const { uri, fileName } = video;
      
      if (!uri || typeof uri !== 'string') {
        throw new Error('Invalid video URI');
      }

      // Upload phase
      updateVideoStatus(index, {
        status: 'uploading',
        progress: 0,
        details: 'Preparing upload...',
      });
      
      simulateUploadProgress(index);
      
      const uploadStart = performance.now();
      const videoId = await uploadVideo(uri, fileName);
      const uploadTime = parseFloat(((performance.now() - uploadStart) / 1000).toFixed(2));
      console.log(`[Processing] ✓ Upload completed in ${uploadTime}s`);
      
      // Clear upload interval
      const uploadInterval = intervalRefsRef.current.get(index);
      if (uploadInterval) {
        clearInterval(uploadInterval);
        intervalRefsRef.current.delete(index);
      }
      
      // Clipping phase
      updateVideoStatus(index, {
        status: 'clipping',
        progress: 50,
        details: 'Analyzing video...',
        videoId,
      });
      
      const clipsStart = performance.now();
      
      // Estimate clip count
      const duration = parseFloat(video.duration) || 180;
      const estimatedClips = Math.ceil(duration / 15);
      simulateClipProgress(index, estimatedClips);
      
      const clips = await generateClips(videoId, 15);
      const clipsTime = parseFloat(((performance.now() - clipsStart) / 1000).toFixed(2));
      console.log(`[Processing] ✓ Clips generated in ${clipsTime}s`);
      
      // Clear clip interval
      const clipInterval = intervalRefsRef.current.get(index);
      if (clipInterval) {
        clearInterval(clipInterval);
        intervalRefsRef.current.delete(index);
      }
      
      const totalTime = parseFloat(((performance.now() - totalStartTime) / 1000).toFixed(2));
      const metrics = { uploadTime, clipTime: clipsTime, totalTime };
      
      // Mark as complete
      updateVideoStatus(index, {
        status: 'complete',
        progress: 100,
        clips,
        metrics,
        details: `${clips.length} clips generated`,
        clipsGenerated: clips.length,
        totalClips: clips.length,
      });
      
      // Store processed video
      const processedVideo: ProcessedVideo = {
        videoId,
        clips,
        metrics,
      };
      setProcessedVideos(prev => [...prev, processedVideo]);
      
    } catch (err) {
      // Clear intervals on error
      const interval = intervalRefsRef.current.get(index);
      if (interval) {
        clearInterval(interval);
        intervalRefsRef.current.delete(index);
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to process video';
      console.error(`[Processing] ❌ ERROR Video ${index + 1}:`, errorMessage);
      
      updateVideoStatus(index, {
        status: 'error',
        error: errorMessage,
        details: 'Processing failed',
      });
    }
  };

  const renderVideoItem = (item: VideoQueueItem) => {
    const progressAnim = progressAnimsRef.current.get(item.index) || new Animated.Value(0);
    const statusColors = {
      queued: '#999',
      uploading: '#007AFF',
      clipping: '#FF9500',
      complete: '#34C759',
      error: '#FF3B30',
    };
    const statusIcons = {
      queued: '⏳',
      uploading: '📤',
      clipping: '✂️',
      complete: '✅',
      error: '❌',
    };

    return (
      <View key={item.index} style={styles.videoQueueItem}>
        <View style={styles.videoItemHeader}>
          <View style={styles.videoItemLeft}>
            <Text style={styles.videoItemIcon}>{statusIcons[item.status]}</Text>
            <View style={styles.videoItemInfo}>
              <Text style={styles.videoItemName} numberOfLines={1}>
                {item.video.fileName}
              </Text>
              <Text style={styles.videoItemStatus}>
                {item.status === 'queued' && 'Waiting...'}
                {item.status === 'uploading' && 'Uploading...'}
                {item.status === 'clipping' && 'Generating clips...'}
                {item.status === 'complete' && `${item.clips?.length || 0} clips generated`}
                {item.status === 'error' && item.error}
              </Text>
            </View>
          </View>
          {item.status === 'uploading' || item.status === 'clipping' ? (
            <ActivityIndicator size="small" color={statusColors[item.status]} />
          ) : null}
        </View>

        {/* Progress Bar */}
        {(item.status === 'uploading' || item.status === 'clipping' || item.status === 'complete') && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View 
                style={[
                  styles.progressFill, 
                  { 
                    backgroundColor: statusColors[item.status],
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    })
                  }
                ]} 
              />
            </View>
            <View style={styles.progressInfo}>
              <Text style={styles.progressText}>{Math.round(item.progress)}%</Text>
              {item.clipsGenerated !== undefined && item.totalClips !== undefined && (
                <Text style={styles.clipCountText}>
                  {item.clipsGenerated}/{item.totalClips} clips
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Details */}
        {item.details && item.status !== 'complete' && (
          <Text style={styles.videoItemDetails}>{item.details}</Text>
        )}

        {/* Metrics */}
        {item.metrics && item.status === 'complete' && (
          <View style={styles.videoMetrics}>
            <Text style={styles.videoMetricText}>
              Upload: {item.metrics.uploadTime}s • 
              Clipping: {item.metrics.clipTime}s • 
              Total: {item.metrics.totalTime}s
            </Text>
          </View>
        )}
      </View>
    );
  };

  const allComplete = videoQueue.length > 0 && videoQueue.every(item => 
    item.status === 'complete' || item.status === 'error'
  );
  const hasErrors = videoQueue.some(item => item.status === 'error');

  if (error && !videoQueue.length) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Processing Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
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
      <StatusBar style="dark" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Processing {videoQueue.length} Video{videoQueue.length > 1 ? 's' : ''}
          </Text>
          <Text style={styles.headerSubtitle}>
            {videoQueue.filter(v => v.status === 'complete').length} of {videoQueue.length} complete
            {processingRef.current.size > 0 && ` • ${processingRef.current.size} processing`}
            {backendConfig && ` • Max ${backendConfig.max_concurrent_videos} concurrent`}
          </Text>
          {backendConfig && (
            <Text style={styles.configInfo}>
              Backend: {backendConfig.system_info.cpus} CPUs • {backendConfig.max_concurrent_clips} max clips/video
            </Text>
          )}
        </View>

        {/* Video Queue */}
        <View style={styles.queueContainer}>
          {videoQueue.map(renderVideoItem)}
        </View>

        {/* Overall Progress */}
        {videoQueue.length > 1 && (
          <View style={styles.overallProgress}>
            <Text style={styles.overallProgressText}>
              Overall Progress: {Math.round(
                (videoQueue.reduce((sum, item) => sum + item.progress, 0) / videoQueue.length)
              )}%
            </Text>
            <View style={styles.overallProgressBar}>
              <View 
                style={[
                  styles.overallProgressFill,
                  {
                    width: `${(videoQueue.reduce((sum, item) => sum + item.progress, 0) / videoQueue.length)}%`
                  }
                ]} 
              />
            </View>
          </View>
        )}

        {/* Elapsed Time */}
        <Text style={styles.elapsedTime}>
          {elapsedTime.toFixed(1)}s elapsed
        </Text>

        {/* Completion Message */}
        {allComplete && !hasErrors && (
          <View style={styles.completionContainer}>
            <Text style={styles.completionText}>✅ All videos processed!</Text>
            <Text style={styles.completionSubtext}>
              Redirecting to results...
            </Text>
          </View>
        )}

        {hasErrors && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningText}>
              ⚠️ Some videos failed to process. Check individual status above.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  configInfo: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  queueContainer: {
    marginBottom: 24,
  },
  videoQueueItem: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  videoItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  videoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  videoItemIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  videoItemInfo: {
    flex: 1,
  },
  videoItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  videoItemStatus: {
    fontSize: 13,
    color: '#666',
  },
  videoItemDetails: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  progressContainer: {
    width: '100%',
    marginTop: 12,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  clipCountText: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  videoMetrics: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  videoMetricText: {
    fontSize: 11,
    color: '#666',
  },
  overallProgress: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
  },
  overallProgressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  overallProgressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#E5E5E5',
    borderRadius: 5,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 5,
  },
  elapsedTime: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
  completionContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    marginTop: 8,
  },
  completionText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#34C759',
    marginBottom: 4,
  },
  completionSubtext: {
    fontSize: 14,
    color: '#666',
  },
  warningContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    marginTop: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#FF9500',
    textAlign: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    padding: 30,
    justifyContent: 'center',
    flex: 1,
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

