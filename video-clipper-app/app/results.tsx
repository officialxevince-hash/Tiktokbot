import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL } from '../utils/config';

interface Clip {
  id: string;
  url: string;
  duration: number;
}

type SelectionMode = 'none' | 'single' | 'multiple';

export default function Results() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('none');
  
  const clips: Clip[] = params.clips ? JSON.parse(params.clips as string) : [];
  const videoId = params.videoId as string;
  const metrics = params.metrics ? JSON.parse(params.metrics as string) : null;
  
  const totalDuration = useMemo(() => {
    return clips.reduce((sum, clip) => sum + clip.duration, 0);
  }, [clips]);

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

  const renderClip = ({ item, index }: { item: Clip; index: number }) => {
    const videoUrl = `${API_BASE_URL}${item.url}`;
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
        
        <View style={styles.videoContainer}>
          <View style={styles.videoPlaceholder}>
            <Text style={styles.placeholderIcon}>▶</Text>
            <Text style={styles.placeholderText}>{item.id}</Text>
            <Text style={styles.placeholderSubtext}>{item.duration.toFixed(1)}s</Text>
            <View style={styles.clipIndexBadge}>
              <Text style={styles.clipIndexText}>#{index + 1}</Text>
            </View>
          </View>
        </View>
        
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
    <View style={styles.container}>
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
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={10}
        initialNumToRender={3}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No clips generated</Text>
          </View>
        }
      />
    </View>
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
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  placeholderIcon: {
    fontSize: 48,
    color: '#fff',
    marginBottom: 8,
  },
  placeholderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  placeholderSubtext: {
    color: '#999',
    fontSize: 12,
  },
  clipIndexBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
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


