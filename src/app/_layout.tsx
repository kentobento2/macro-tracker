import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Analytics, type BeforeSend } from '@vercel/analytics/react';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Font, useColors, useNavigationTheme } from '@/constants/theme';
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

// Per-weight imports so only these four files are bundled (see `Font` in theme.ts).
const FONT_ASSETS = {
  [Font.regular]: Nunito_400Regular,
  [Font.semibold]: Nunito_600SemiBold,
  [Font.bold]: Nunito_700Bold,
  [Font.heavy]: Nunito_800ExtraBold,
};

function RootNavigator() {
  const { session, loading } = useAuth();
  const c = useColors();
  // If a font fails to load, carry on with the system font rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  if (loading || (!fontsLoaded && !fontError)) {
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
        <Stack.Screen
          name="add"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Add food',
            headerShadowVisible: false,
            headerTitleStyle: { fontFamily: Font.heavy, fontSize: 19 },
          }}
        />
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
