import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Service worker only in production web builds; in dev it would cache stale bundles.
    if (Platform.OS === 'web' && process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
