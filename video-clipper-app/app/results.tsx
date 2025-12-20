import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE_URL } from '../utils/config';

interface Clip {
  id: string;
  url: string;
  duration: number;
}

export default function Results() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  
  const clips: Clip[] = params.clips ? JSON.parse(params.clips as string) : [];
  const videoId = params.videoId as string;

  const handlePreview = (clip: Clip) => {
    router.push({
      pathname: '/clip/[id]',
      params: {
        id: clip.id,
        url: clip.url,
        videoId,
      },
    });
  };

  const handleSave = async (clip: Clip) => {
    try {
      setSaving(clip.id);

      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant media library access to save clips.');
        setSaving(null);
        return;
      }

      // Download clip
      const clipUrl = `${API_BASE_URL}${clip.url}`;
      const fileUri = FileSystem.documentDirectory + `${clip.id}.mp4`;
      
      const downloadResult = await FileSystem.downloadAsync(clipUrl, fileUri);
      
      // Save to media library
      await MediaLibrary.createAssetAsync(downloadResult.uri);
      
      Alert.alert('Success', 'Clip saved to your device!');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save clip. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const renderClip = ({ item }: { item: Clip }) => (
    <View style={styles.clipCard}>
      <View style={styles.videoContainer}>
        <Video
          source={{ uri: `${API_BASE_URL}${item.url}` }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={false}
          useNativeControls={false}
        />
      </View>
      <View style={styles.clipInfo}>
        <Text style={styles.clipId}>{item.id}</Text>
        <Text style={styles.clipDuration}>{item.duration.toFixed(1)}s</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.previewButton]}
          onPress={() => handlePreview(item)}
        >
          <Text style={styles.buttonText}>Preview</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={() => handleSave(item)}
          disabled={saving === item.id}
        >
          {saving === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{clips.length} Clips Generated</Text>
      <FlatList
        data={clips}
        renderItem={renderClip}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 20,
    backgroundColor: '#fff',
  },
  list: {
    padding: 10,
  },
  clipCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  videoContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  clipInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
  },
  clipId: {
    fontSize: 16,
    fontWeight: '600',
  },
  clipDuration: {
    fontSize: 14,
    color: '#666',
  },
  actions: {
    flexDirection: 'row',
    padding: 15,
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewButton: {
    backgroundColor: '#007AFF',
  },
  saveButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});


