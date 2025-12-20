import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView, AppState, AppStateStatus, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL, APP_CONFIG } from '../utils/config';

interface Clip {
  id: string;
  url: string;
  thumbnail_url: string;
  duration: number;
}

type SelectionMode = 'none' | 'single' | 'multiple';

export default function Results() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
  const videoPlayersRef = useRef<Map<string, any>>(new Map());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [visibleClips, setVisibleClips] = useState<Set<string>>(new Set());
  
  const clips: Clip[] = params.clips ? JSON.parse(params.clips as string) : [];
  const videoId = params.videoId as string;
  const metrics = params.metrics ? JSON.parse(params.metrics as string) : null;
  
  const totalDuration = useMemo(() => {
    return clips.reduce((sum, clip) => sum + clip.duration, 0);
  }, [clips]);

  // Prevent cleanup when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[Results] App returned to foreground - restoring video players');
        // Restore video players when app comes back
        videoPlayersRef.current.forEach((player, clipId) => {
          if (player && !player.playing) {
            // Ensure players are ready
            try {
              player.currentTime = 0;
            } catch (e) {
              console.warn(`[Results] Could not restore player for ${clipId}:`, e);
            }
          }
        });
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const toggleSelection = (clipId: string) => {
    const newSelected = new Set(selectedClips);
    if (newSelected.has(clipId)) {
      newSelected.delete(clipId);
    } else {
      newSelected.add(clipId);
    }
    setSelectedClips(newSelected);
    if (newSelected.size === 0) {
      setSelectionMode('none');
    }
  };

  const handlePreview = (clip: Clip) => {
    if (selectionMode === 'multiple') {
      toggleSelection(clip.id);
      return;
    }
    router.push({
      pathname: '/clip/[id]',
      params: {
        id: clip.id,
        url: clip.url,
        videoId,
      },
    });
  };

  const handleSelectAll = () => {
    if (selectedClips.size === clips.length) {
      setSelectedClips(new Set());
      setSelectionMode('none');
    } else {
      setSelectedClips(new Set(clips.map(c => c.id)));
      setSelectionMode('multiple');
    }
  };

  const handleBatchSave = async () => {
    if (selectedClips.size === 0) {
      Alert.alert('No Selection', 'Please select clips to save.');
      return;
    }

    const clipsToSave = clips.filter(c => selectedClips.has(c.id));
    let successCount = 0;
    let failCount = 0;

    Alert.alert(
      'Save Multiple Clips',
      `Save ${clipsToSave.length} selected clip${clipsToSave.length > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            for (const clip of clipsToSave) {
              try {
                await handleSave(clip, true);
                successCount++;
              } catch {
                failCount++;
              }
            }
            Alert.alert(
              'Batch Save Complete',
              `Saved: ${successCount}\nFailed: ${failCount}`
            );
            setSelectedClips(new Set());
            setSelectionMode('none');
          },
        },
      ]
    );
  };

  const handleSave = async (clip: Clip, silent = false) => {
    const startTime = performance.now();
    try {
      setSaving(clip.id);
      console.log(`[Save] ⏱️  START saving ${clip.id} - ${new Date().toISOString()}`);

      // Request permissions
      const permStart = performance.now();
      const { status } = await MediaLibrary.requestPermissionsAsync();
      const permTime = ((performance.now() - permStart) / 1000).toFixed(3);
      console.log(`[Save] Permission check: ${status} (${permTime}s)`);
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant media library access to save clips.');
        setSaving(null);
        return;
      }

      // Download clip
      const clipUrl = `${API_BASE_URL}${clip.url}`;
      const fileUri = FileSystem.documentDirectory + `${clip.id}.mp4`;
      
      console.log(`[Save] Downloading from: ${clipUrl}`);
      const downloadStart = performance.now();
      const downloadResult = await FileSystem.downloadAsync(clipUrl, fileUri);
      const downloadTime = ((performance.now() - downloadStart) / 1000).toFixed(3);
      console.log(`[Save] ✓ Download completed in ${downloadTime}s`);
      
      // Save to media library
      const saveStart = performance.now();
      await MediaLibrary.createAssetAsync(downloadResult.uri);
      const saveTime = ((performance.now() - saveStart) / 1000).toFixed(3);
      const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
      console.log(`[Save] ✅ SUCCESS - Total time: ${totalTime}s (save: ${saveTime}s)`);
      
      if (!silent) {
        Alert.alert('Success', 'Clip saved to your device!');
      }
    } catch (error) {
      const totalTime = ((performance.now() - startTime) / 1000).toFixed(3);
      console.error(`[Save] ❌ ERROR after ${totalTime}s:`, error);
      Alert.alert('Error', 'Failed to save clip. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const ClipVideoPreview = ({ videoUrl, thumbnailUrl, clipId, index, duration, isVisible }: { videoUrl: string; thumbnailUrl: string; clipId: string; index: number; duration: number; isVisible: boolean }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [shouldLoad, setShouldLoad] = useState(isVisible);
    const playerRef = useRef<any>(null);
    
    // Only create player when visible or about to be visible
    const player = useVideoPlayer(shouldLoad ? videoUrl : '', (player) => {
      if (!shouldLoad) return;
      player.loop = APP_CONFIG.video.player.loop;
      player.muted = APP_CONFIG.video.player.muted;
      playerRef.current = player;
      videoPlayersRef.current.set(clipId, player);
    });

    // Lazy load: only load when visible
    useEffect(() => {
      if (isVisible && !shouldLoad) {
        setShouldLoad(true);
      }
    }, [isVisible, shouldLoad, clipId]);

    // Listen to playing state changes
    useEffect(() => {
      if (!player || !shouldLoad) return;
      
      const playingListener = player.addListener('playingChange', () => {
        try {
          setIsPlaying(player?.playing ?? false);
        } catch (e) {
          // Player may have been disposed
        }
      });
      
      // Set initial playing state
      try {
        setIsPlaying(player?.playing ?? false);
      } catch (e) {
        // Player may not be ready yet
      }
      
      return () => {
        playingListener.remove();
      };
    }, [player, shouldLoad]);

    // Handle video ending - pause and show thumbnail
    useEffect(() => {
      if (!player || !shouldLoad) return;
      
      const timeUpdateListener = player.addListener('timeUpdate', () => {
        try {
          if (player.currentTime >= duration - 0.1 && player.playing) {
            player.pause();
            setIsPlaying(false);
          }
        } catch (e) {
          // Player may have been disposed
        }
      });

      return () => {
        timeUpdateListener.remove();
      };
    }, [player, duration, shouldLoad]);

    const handlePlayPause = () => {
      try {
        if (!player) return;
        
        if (isPlaying) {
          player.pause();
          setIsPlaying(false);
        } else {
          player.loop = APP_CONFIG.video.player.loop;
          player.play();
          setIsPlaying(true);
        }
      } catch (e) {
        // Player may have been disposed
      }
    };

    const fullThumbnailUrl = `${API_BASE_URL}${thumbnailUrl}`;
    
    if (!shouldLoad) {
      // Placeholder while not visible - show thumbnail image
      return (
        <View style={styles.videoContainer}>
          <Image
            source={{ uri: fullThumbnailUrl }}
            style={styles.videoPreview}
            resizeMode="cover"
          />
          <View style={styles.clipIndexBadge}>
            <Text style={styles.clipIndexText}>#{index + 1}</Text>
          </View>
        </View>
      );
    }

    if (!player) {
      // Show thumbnail while player initializes
      return (
        <View style={styles.videoContainer}>
          <Image
            source={{ uri: fullThumbnailUrl }}
            style={styles.videoPreview}
            resizeMode="cover"
          />
          <View style={styles.clipIndexBadge}>
            <Text style={styles.clipIndexText}>#{index + 1}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.videoContainer}>
        {isPlaying && player ? (
          <VideoView
            player={player}
            style={styles.videoPreview}
            contentFit="cover"
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
          />
        ) : (
          <Image
            source={{ uri: fullThumbnailUrl }}
            style={styles.videoPreview}
            resizeMode="cover"
          />
        )}
        <View style={styles.clipIndexBadge}>
          <Text style={styles.clipIndexText}>#{index + 1}</Text>
        </View>
        {!isPlaying && (
          <TouchableOpacity
            style={styles.playButtonOverlay}
            onPress={handlePlayPause}
            activeOpacity={0.8}
          >
            <View style={styles.playButton}>
              <Text style={styles.playButtonIcon}>▶</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.videoTapArea}
          onPress={handlePlayPause}
          activeOpacity={1}
        />
      </View>
    );
  };

  const renderClip = ({ item, index }: { item: Clip; index: number }) => {
    const videoUrl = `${API_BASE_URL}${item.url}`;
    const thumbnailUrl = item.thumbnail_url || item.url.replace('.mp4', '.jpg'); // Fallback if thumbnail_url not provided
    const isSelected = selectedClips.has(item.id);
    const isSaving = saving === item.id;
    
    return (
      <TouchableOpacity
        style={[
          styles.clipCard,
          isSelected && styles.clipCardSelected,
          isSaving && styles.clipCardSaving,
        ]}
        onLongPress={() => {
          setSelectionMode('multiple');
          toggleSelection(item.id);
        }}
        activeOpacity={0.7}
      >
        {selectionMode === 'multiple' && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
        
        <ClipVideoPreview
          videoUrl={videoUrl}
          thumbnailUrl={thumbnailUrl}
          clipId={item.id}
          index={index}
          duration={item.duration}
          isVisible={visibleClips.has(item.id) || index < 3}
        />
        
        <View style={styles.clipInfo}>
          <View style={styles.clipInfoLeft}>
            <Text style={styles.clipId}>{item.id}</Text>
            <Text style={styles.clipTimeRange}>
              {((index * 15) / 60).toFixed(1)}m - {(((index + 1) * 15) / 60).toFixed(1)}m
            </Text>
          </View>
          <View style={styles.clipInfoRight}>
            <Text style={styles.clipDuration}>{item.duration.toFixed(1)}s</Text>
            <Text style={styles.clipSize}>~{((item.duration * 2.5) / 1024).toFixed(1)}MB</Text>
          </View>
        </View>
        
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.previewButton, isSelected && styles.buttonDisabled]}
            onPress={() => handlePreview(item)}
            disabled={isSaving}
          >
            <Text style={styles.buttonText}>Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.saveButton, isSelected && styles.buttonDisabled]}
            onPress={() => handleSave(item)}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header with stats and actions */}
        <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>{clips.length} Clips</Text>
            <Text style={styles.subtitle}>
              {totalDuration.toFixed(1)}s total • {clips.length} segments
            </Text>
          </View>
          <View style={styles.headerActions}>
            {selectionMode === 'multiple' ? (
              <>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleSelectAll}
                >
                  <Text style={styles.headerButtonText}>
                    {selectedClips.size === clips.length ? 'Deselect' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                {selectedClips.size > 0 && (
                  <TouchableOpacity
                    style={[styles.headerButton, styles.headerButtonPrimary]}
                    onPress={handleBatchSave}
                  >
                    <Text style={[styles.headerButtonText, styles.headerButtonTextWhite]}>
                      Save {selectedClips.size}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => {
                    setSelectionMode('none');
                    setSelectedClips(new Set());
                  }}
                >
                  <Text style={styles.headerButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setSelectionMode('multiple')}
              >
                <Text style={styles.headerButtonText}>Select</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        {/* Performance Metrics */}
        {metrics && (
          <View style={styles.metricsBar}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Upload</Text>
              <Text style={styles.metricValue}>{metrics.uploadTime?.toFixed(1)}s</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Processing</Text>
              <Text style={styles.metricValue}>{metrics.clipTime?.toFixed(1)}s</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Total</Text>
              <Text style={styles.metricValue}>{metrics.totalTime?.toFixed(1)}s</Text>
            </View>
          </View>
        )}
      </View>

      <FlatList
        data={clips}
        renderItem={renderClip}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        removeClippedSubviews={APP_CONFIG.list.removeClippedSubviews}
        maxToRenderPerBatch={APP_CONFIG.list.maxToRenderPerBatch}
        windowSize={APP_CONFIG.list.windowSize}
        initialNumToRender={APP_CONFIG.list.initialNumToRender}
        updateCellsBatchingPeriod={APP_CONFIG.list.updateCellsBatchingPeriod}
        getItemLayout={(data, index) => ({
          length: APP_CONFIG.list.itemHeight,
          offset: APP_CONFIG.list.itemHeight * index,
          index,
        })}
        onViewableItemsChanged={({ viewableItems }) => {
          // Update visible clips for lazy loading
          const visibleIds = new Set(viewableItems.map(item => item.item.id));
          setVisibleClips(visibleIds);
        }}
        viewabilityConfig={{
          itemVisiblePercentThreshold: APP_CONFIG.list.viewabilityThreshold,
          minimumViewTime: APP_CONFIG.list.minimumViewTime,
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No clips generated</Text>
          </View>
        }
      />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  headerButtonPrimary: {
    backgroundColor: '#34C759',
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  headerButtonTextWhite: {
    color: '#fff',
  },
  metricsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8F8F8',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 8,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  list: {
    padding: 15,
  },
  clipCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  clipCardSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },
  clipCardSaving: {
    opacity: 0.6,
  },
  checkbox: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#fff',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  videoContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  videoTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  playButtonIcon: {
    color: '#fff',
    fontSize: 24,
    marginLeft: 4,
  },
  clipIndexBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 10,
  },
  clipIndexText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  clipInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  clipInfoLeft: {
    flex: 1,
  },
  clipInfoRight: {
    alignItems: 'flex-end',
  },
  clipId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  clipTimeRange: {
    fontSize: 12,
    color: '#999',
  },
  clipDuration: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  clipSize: {
    fontSize: 11,
    color: '#999',
  },
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  previewButton: {
    backgroundColor: '#007AFF',
  },
  saveButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});


