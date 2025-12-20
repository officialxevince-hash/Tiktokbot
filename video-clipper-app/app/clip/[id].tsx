import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode } from 'expo-video';
import { API_BASE_URL } from '../../utils/config';

export default function ClipPreview() {
  const params = useLocalSearchParams();
  const url = params.url as string;
  const videoUrl = `${API_BASE_URL}${url}`;

  return (
    <View style={styles.container}>
      <Video
        source={{ uri: videoUrl }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={true}
        useNativeControls={true}
        isLooping={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});


