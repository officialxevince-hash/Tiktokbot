import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Select Video' }} />
      <Stack.Screen name="processing" options={{ title: 'Processing' }} />
      <Stack.Screen name="results" options={{ title: 'Generated Clips' }} />
      <Stack.Screen name="clip/[id]" options={{ title: 'Preview Clip' }} />
    </Stack>
  );
}

