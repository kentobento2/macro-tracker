import { Analytics, type BeforeSend } from '@vercel/analytics/react';
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
      {/* Vercel Web Analytics (cookieless page views). Must render here, not in +html.tsx, which never runs
          in the browser. The script and endpoint are same-origin (/_vercel/insights), so the CSP needs no change. */}
      {Platform.OS === 'web' && process.env.NODE_ENV === 'production' ? <Analytics beforeSend={withoutQuery} /> : null}
    </ThemeProvider>
  );
}

/** Report page paths only: query strings can carry ids (?entryId=…, ?authorization_id=…). */
const withoutQuery: BeforeSend = (event) => {
  const url = new URL(event.url);
  return { ...event, url: `${url.origin}${url.pathname}` };
};

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
      {/* Reachable signed in or out: it handles its own sign-in so it can return to the assistant. */}
      <Stack.Screen name="oauth/consent" />
      {/* Public quick-start guide: send new users the link before they sign in. */}
      <Stack.Screen name="guide" />
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
