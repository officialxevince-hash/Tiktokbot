import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { API_BASE_URL } from '../../utils/config';

export default function ClipPreview() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const url = params.url as string;
  const clipId = params.id as string;
  
  // Ensure absolute URL for web compatibility
  const videoUrl = url.startsWith('http://') || url.startsWith('https://') 
    ? url 
    : `${API_BASE_URL}${url}`;
  
  const player = useVideoPlayer(videoUrl, (player) => {
    player.play();
  });

  return (
    <>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{clipId}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={true}
          fullscreenOptions={{ enable: true }}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 60,
  },
  video: {
    flex: 1,
    width: '100%',
  },
});


