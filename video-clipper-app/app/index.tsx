import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { uploadVideo } from '../utils/api';

export default function VideoPicker() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const pickVideo = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant media library access to select videos.');
        return;
      }

      // Pick videos (allow multiple)
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
        allowsMultipleSelection: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      // Validate all selected files are videos
      const validVideos = result.assets.filter(asset => 
        asset.mimeType?.startsWith('video/')
      );

      if (validVideos.length === 0) {
        Alert.alert('Invalid Files', 'Please select at least one video file.');
        return;
      }

      if (validVideos.length < result.assets.length) {
        Alert.alert(
          'Some Files Skipped',
          `${result.assets.length - validVideos.length} non-video file(s) were skipped.`
        );
      }

      // Prepare video queue
      const videoQueue = validVideos.map(asset => ({
        uri: asset.uri,
        duration: asset.duration?.toString() || '0',
        fileName: asset.fileName || 'video.mp4',
      }));

      // Navigate to processing screen with video queue
      router.push({
        pathname: '/processing',
        params: {
          videos: JSON.stringify(videoQueue),
          currentIndex: '0',
          totalVideos: videoQueue.length.toString(),
        },
      });
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'Failed to pick video. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✂️</Text>
        </View>
        <Text style={styles.title}>Video Clipper</Text>
        <Text style={styles.subtitle}>
          Automatically split videos into short clips{'\n'}
          <Text style={styles.subtitleHint}>Select one or multiple videos to process</Text>
        </Text>
        
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={pickVideo}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Loading...' : 'Select Video(s)'}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How it works:</Text>
          <Text style={styles.infoText}>• Select one or multiple videos</Text>
          <Text style={styles.infoText}>• Automatic clip generation (15s max)</Text>
          <Text style={styles.infoText}>• Preview and save clips</Text>
          <Text style={styles.infoText}>• Batch processing supported</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  iconContainer: {
    marginBottom: 20,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  subtitleHint: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 50,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 30,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoBox: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
});


