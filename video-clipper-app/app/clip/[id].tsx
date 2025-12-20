import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { API_BASE_URL } from '../../utils/config';

export default function ClipPreview() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const url = params.url as string;
  const clipId = params.id as string;
  const videoUrl = `${API_BASE_URL}${url}`;
  
  const player = useVideoPlayer(videoUrl, (player) => {
    player.play();
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
        allowsFullscreen={true}
      />
    </View>
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
    paddingTop: 50,
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


