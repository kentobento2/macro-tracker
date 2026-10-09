// Settings section: personal API tokens for AI assistants that can't sign in with OAuth (e.g. Meta Muse).
// The token is generated on this device and shown once; only its SHA-256 hash is sent to the server.

import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH, Radius, Space, useColors } from '@/constants/theme';
import { useOnline } from '@/data/data-provider';
import {
  API_TOKEN_TTL_DAYS,
  apiTokenDisplayPrefix,
  apiTokenExpiresAt,
  formatApiToken,
  isApiTokenExpired,
} from '@/lib/api-tokens';
import { supabase } from '@/lib/supabase';

import { AppText, Banner, Button, Card, Field } from './ui';

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const MCP_URL = 'https://macro-tracker-rho-two.vercel.app/api/mcp';

const fetchTokens = () =>
  supabase
    .from('api_tokens')
    .select('id,name,token_prefix,created_at,last_used_at,revoked_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function ApiTokensCard() {
  const c = useColors();
  const online = useOnline();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState('Meta Muse');
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((n) => n + 1);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    fetchTokens().then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) setError("Couldn't load your tokens.");
      else setTokens(data);
    });
    return () => {
      cancelled = true;
    };
  }, [online, reloads]);

  const create = async () => {
    const label = name.trim();
    if (!label) return setError('Give the token a name, like "Meta Muse".');
    setBusy(true);
    setError(null);
    try {
      const token = formatApiToken(Crypto.getRandomBytes(32));
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token, {
        encoding: Crypto.CryptoEncoding.HEX,
      });
      const { error: e } = await supabase
        .from('api_tokens')
        .insert({ name: label.slice(0, 60), token_hash: hash.toLowerCase(), token_prefix: apiTokenDisplayPrefix(token) });
      if (e) throw e;
      setCreated({ token, name: label });
      setCopied(false);
      reload();
    } catch {
      setError("Couldn't create the token. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    const { error: e } = await supabase.from('api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (e) setError("Couldn't revoke the token. Try again.");
    reload();
  };

  const copy = async () => {
    if (!created) return;
    if (Platform.OS === 'web' && navigator.clipboard) {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    }
  };

  return (
    <Card>
      <AppText variant="heading">Assistant access</AppText>
      <AppText variant="small">
        Lets an AI assistant log meals and weigh-ins for you. Claude connects by signing in (no token needed). Use a token
        for assistants that ask for an API key or bearer token, such as Meta Muse. Server URL: {MCP_URL}
      </AppText>

      {!online ? <Banner>Connect to the internet to manage tokens.</Banner> : null}
      {error ? <Banner>{error}</Banner> : null}

      {created ? (
        <View style={[styles.reveal, { borderColor: c.primary, backgroundColor: c.primarySoft }]}>
          <AppText variant="label">Your new token for {created.name}</AppText>
          <AppText variant="small">
            Copy it now. It won&apos;t be shown again. Treat it like a password. It stops working after{' '}
            {API_TOKEN_TTL_DAYS} days.
          </AppText>
          <Text selectable style={[styles.token, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}>
            {created.token}
          </Text>
          <View style={styles.row}>
            {Platform.OS === 'web' ? (
              <Button title={copied ? 'Copied' : 'Copy'} variant="secondary" onPress={copy} style={styles.flex} />
            ) : null}
            <Button title="Done" onPress={() => setCreated(null)} style={styles.flex} />
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <Field value={name} onChangeText={setName} maxLength={60} accessibilityLabel="Token name" />
          <Button title="Create token" onPress={create} loading={busy} disabled={!online} />
        </View>
      )}

      {tokens && tokens.length > 0 ? (
        <View>
          {tokens.map((t) => (
            <View key={t.id} style={[styles.tokenRow, { borderTopColor: c.border }]}>
              <View style={styles.flex}>
                <AppText>{t.name}</AppText>
                <AppText variant="small">
                  {t.token_prefix}… · {t.last_used_at ? `last used ${shortDate(t.last_used_at)}` : 'never used'}
                </AppText>
                {isApiTokenExpired(t.created_at, new Date()) ? (
                  <AppText variant="small" style={{ color: c.danger }}>
                    Expired. Create a new token for this assistant.
                  </AppText>
                ) : (
                  <AppText variant="small">Expires {shortDate(apiTokenExpiresAt(t.created_at).toISOString())}</AppText>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Revoke ${t.name}`}
                onPress={() => revoke(t.id)}
                style={({ pressed }) => [styles.revoke, { borderColor: c.danger, opacity: pressed ? 0.6 : 1 }]}>
                <AppText variant="label" style={{ color: c.danger }}>
                  Revoke
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : tokens ? (
        <AppText variant="small">No active tokens.</AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.sm, alignItems: 'center' },
  flex: { flex: 1 },
  reveal: { borderWidth: 1.5, borderRadius: Radius.md, padding: Space.md, gap: Space.sm },
  token: {
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, Consolas, monospace', default: undefined }),
    fontSize: 14,
    padding: Space.sm,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
    minHeight: MIN_TOUCH + 8,
  },
  revoke: { minHeight: MIN_TOUCH - 8, paddingHorizontal: Space.md, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
});
