// OAuth consent page for AI assistants (e.g. Claude) connecting to the Macro Tracker MCP server.
// Supabase Auth's OAuth 2.1 server sends the user here with ?authorization_id=…; we show who is asking
// and let the user allow or deny. Supabase then redirects back to the assistant.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { Space, useColors } from '@/constants/theme';
import { signInWithGoogle, useAuth } from '@/data/auth';
import { supabase } from '@/lib/supabase';

type Details = { clientName: string; clientUri: string; redirectHost: string; email: string; scope: string };
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; details: Details }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string };

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export default function OAuthConsentScreen() {
  const c = useColors();
  const { session, loading: authLoading } = useAuth();
  const { authorization_id: authorizationId } = useLocalSearchParams<{ authorization_id?: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session || !authorizationId) return;
    let cancelled = false;
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setState({ kind: 'error', message: 'This connection request is invalid or has expired. Start again from the assistant.' });
      } else if ('redirect_url' in data) {
        // Already approved earlier: go straight back to the assistant.
        setState({ kind: 'redirecting' });
        window.location.replace(data.redirect_url);
      } else {
        setState({
          kind: 'ready',
          details: {
            clientName: data.client.name || 'An AI assistant',
            clientUri: data.client.uri,
            redirectHost: hostOf(data.redirect_uri),
            email: data.user.email,
            scope: data.scope,
          },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session, authorizationId]);

  const decide = async (approve: boolean) => {
    if (!authorizationId) return;
    setBusy(true);
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data) {
      setBusy(false);
      setState({ kind: 'error', message: 'Something went wrong. Start the connection again from the assistant.' });
      return;
    }
    setState({ kind: 'redirecting' });
    window.location.replace(data.redirect_url);
  };

  let body: React.ReactNode;
  if (Platform.OS !== 'web') {
    body = <AppText variant="muted">Open this link in a web browser to connect your assistant.</AppText>;
  } else if (!authorizationId) {
    body = <Banner>This page is opened by an AI assistant when you connect it. There&apos;s nothing to do here on its own.</Banner>;
  } else if (authLoading) {
    body = <ActivityIndicator color={c.primary} />;
  } else if (!session) {
    body = (
      <>
        <AppText variant="muted">Sign in to Macro Tracker to connect your assistant to your food log.</AppText>
        <Button
          title="Continue with Google"
          onPress={() => signInWithGoogle(window.location.href)}
          icon={<Ionicons name="logo-google" size={18} color={c.onInk} />}
        />
      </>
    );
  } else if (state.kind === 'loading' || state.kind === 'redirecting') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={c.primary} />
        <AppText variant="small">{state.kind === 'redirecting' ? 'Returning to your assistant…' : 'Loading…'}</AppText>
      </View>
    );
  } else if (state.kind === 'error') {
    body = <Banner>{state.message}</Banner>;
  } else {
    const d = state.details;
    body = (
      <>
        <AppText variant="heading">
          {d.clientName} wants to access your Macro Tracker
        </AppText>
        <AppText variant="muted">Signed in as {d.email}</AppText>
        <View style={styles.list}>
          {[
            'See your food log, daily totals, targets, favorites and weigh-ins',
            'Add, change and delete food log entries and weigh-ins',
          ].map((line) => (
            <View key={line} style={styles.row}>
              <Ionicons name="checkmark-circle" size={18} color={c.primary} />
              <AppText style={styles.flex}>{line}</AppText>
            </View>
          ))}
        </View>
        <AppText variant="small">
          Only your own data, never anyone else&apos;s. You&apos;ll return to {d.redirectHost}. You can disconnect it from the
          assistant&apos;s connector settings at any time.
        </AppText>
        <View style={styles.row}>
          <Button title="Deny" variant="secondary" onPress={() => decide(false)} disabled={busy} style={styles.flex} />
          <Button title="Allow" onPress={() => decide(true)} loading={busy} style={styles.flex} />
        </View>
      </>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <AppText variant="title">Connect assistant</AppText>
      <Card>{body}</Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.md },
  list: { gap: Space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  flex: { flex: 1 },
});
