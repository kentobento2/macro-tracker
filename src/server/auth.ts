// Resolves the user for an MCP request from its Authorization header. Two kinds of bearer token:
// - Personal API tokens ("mt_…", for assistants without OAuth such as Meta Muse): looked up by SHA-256 hash.
// - Supabase OAuth access tokens (Claude custom connectors): verified with Supabase Auth.

import { isApiToken, isApiTokenExpired } from '../lib/api-tokens';
import type { Db } from './store';

export type AuthResult = { userId: string; via: 'api_token' | 'oauth'; tokenId?: string };

/** SHA-256 of a UTF-8 string as lowercase hex (Web Crypto: works in Node, browsers and React Native web). */
export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Three base64url segments, within a sane size. Supabase access tokens are well under 4 KB. */
export const looksLikeJwt = (s: string) => s.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);

// Don't write last_used_at on every request.
const LAST_USED_RESOLUTION_MS = 10 * 60 * 1000;

export async function resolveUser(authorization: string | null, db: Db, now = new Date()): Promise<AuthResult | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;

  if (isApiToken(token)) {
    const { data, error } = await db
      .from('api_tokens')
      .select('id,user_id,created_at,revoked_at,last_used_at')
      .eq('token_hash', await sha256Hex(token))
      .maybeSingle();
    if (error || !data || data.revoked_at || isApiTokenExpired(data.created_at, now)) return null;
    const lastUsed = data.last_used_at ? Date.parse(data.last_used_at) : 0;
    if (now.getTime() - lastUsed > LAST_USED_RESOLUTION_MS) {
      // Best effort; a failure here shouldn't block the request.
      await db.from('api_tokens').update({ last_used_at: now.toISOString() }).eq('id', data.id);
    }
    return { userId: data.user_id, via: 'api_token', tokenId: data.id };
  }

  // Anything that isn't shaped like a JWT is rejected here, without a round trip to Supabase Auth.
  if (!looksLikeJwt(token)) return null;
  // Supabase verifies the JWT (signature, expiry, revoked sessions) and returns its user.
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, via: 'oauth' };
}
