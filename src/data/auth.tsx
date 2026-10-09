import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    // getSession reads the stored session, so this also works offline.
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// If sign-in fails, Supabase redirects back with ?error_description=... (or in the #hash).
// Capture it once at startup, before the router rewrites the URL.
const redirectError: string | null = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const description = query.get('error_description') ?? hash.get('error_description');
  if (!description) return null;
  // The email allowlist trigger makes account creation fail with this generic message.
  return /database error saving new user/i.test(description)
    ? 'This app is invite-only. Sign in with an invited Google account.'
    : description;
})();

export function getSignInRedirectError() {
  return redirectError;
}

/** Redirects to Google. Comes back to `returnTo` (default: the app's home page), which must be an allowed redirect URL in Supabase. */
export async function signInWithGoogle(returnTo?: string) {
  if (Platform.OS !== 'web') {
    throw new Error('Google sign-in is only set up for the web app.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnTo ?? window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  // 'local' signs out this device only (and works offline).
  await supabase.auth.signOut({ scope: 'local' });
}
