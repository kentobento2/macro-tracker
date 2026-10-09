import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Screen } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { getSignInRedirectError, signInWithGoogle } from '@/data/auth';

const noopSubscribe = () => () => {};

export default function SignInScreen() {
  const c = useColors();
  const [loading, setLoading] = useState(false);
  // Server render has no URL; read the redirect error on the client only (avoids a hydration mismatch).
  const redirectError = useSyncExternalStore(noopSubscribe, getSignInRedirectError, () => null);
  const [clickError, setError] = useState<string | null>(null);
  const error = clickError ?? (loading ? null : redirectError);

  const onPress = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle(); // redirects away on success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Try again.');
      setLoading(false);
    }
  };

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={[styles.logo, { backgroundColor: c.primarySoft }]}>
          <Ionicons name="nutrition" size={40} color={c.primary} />
        </View>
        <AppText variant="title">Macro Tracker</AppText>
        <AppText variant="muted" style={styles.tagline}>
          Log meals, hit your targets. Your log is private to your account.
        </AppText>
      </View>
      {error ? <Banner>{error}</Banner> : null}
      <Button
        title="Continue with Google"
        onPress={onPress}
        loading={loading}
        icon={<Ionicons name="logo-google" size={18} color={c.onPrimary} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md },
  logo: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  tagline: { textAlign: 'center', maxWidth: 300 },
});
