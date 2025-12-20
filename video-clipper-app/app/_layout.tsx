import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const backgroundKeepAliveRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Keep app alive in background
    const keepAlive = () => {
      // Prevent app from being suspended
      if (backgroundKeepAliveRef.current) {
        clearInterval(backgroundKeepAliveRef.current);
      }
      
      // Periodic wake-up to prevent suspension (every 30 seconds)
      backgroundKeepAliveRef.current = setInterval(() => {
        // Minimal activity to keep app alive
        if (AppState.currentState === 'background' || AppState.currentState === 'inactive') {
          console.log('[AppState] Keeping app alive in background');
        }
      }, 30000);
    };

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log('[AppState] State changed:', appState.current, '->', nextAppState);
      
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[AppState] App has come to the foreground');
      } else if (
        appState.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        console.log('[AppState] App has gone to the background');
        keepAlive();
      }

      appState.current = nextAppState;
    });

    // Initial keep-alive setup
    keepAlive();

    return () => {
      subscription.remove();
      if (backgroundKeepAliveRef.current) {
        clearInterval(backgroundKeepAliveRef.current);
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Slot />
    </SafeAreaProvider>
  );
}


