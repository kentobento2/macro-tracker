import { Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { useColors, useNavigationTheme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/data/auth';
import { DataProvider } from '@/data/data-provider';

export default function RootLayout() {
  useEffect(() => {
    // Service worker only in production web builds; in dev it would cache stale bundles.
    if (Platform.OS === 'web' && process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <ThemeProvider value={useNavigationTheme()}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const c = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={{ presentation: 'modal', headerShown: true, title: 'Add food' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );

  return session ? (
    <DataProvider key={session.user.id} userId={session.user.id}>
      {stack}
    </DataProvider>
  ) : (
    stack
  );
}
