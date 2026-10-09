// Personal API tokens for assistants that can't do OAuth. Pure helpers shared by the app (which creates
// tokens) and the MCP server (which checks them). Only a SHA-256 hash of a token is ever stored.

export const API_TOKEN_PREFIX = 'mt_';

/** "mt_" + 43 base64url characters (32 random bytes). */
export function formatApiToken(randomBytes: Uint8Array): string {
  if (randomBytes.length !== 32) throw new RangeError('API tokens need exactly 32 random bytes.');
  let binary = '';
  for (const b of randomBytes) binary += String.fromCharCode(b);
  // btoa exists in browsers, React Native (Hermes) and Node 16+.
  return API_TOKEN_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isApiToken(s: string): boolean {
  return /^mt_[A-Za-z0-9_-]{43}$/.test(s);
}

/** Tokens stop working this long after they're created; the user makes a new one. Limits a leaked token's life. */
export const API_TOKEN_TTL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a token created at `createdAt` (ISO timestamp) expires. */
export function apiTokenExpiresAt(createdAt: string): Date {
  return new Date(Date.parse(createdAt) + API_TOKEN_TTL_DAYS * DAY_MS);
}

/** True once the token is past its expiry, or if its creation time can't be read (fail closed). */
export function isApiTokenExpired(createdAt: string, now: Date): boolean {
  const expires = apiTokenExpiresAt(createdAt).getTime();
  return Number.isNaN(expires) || now.getTime() >= expires;
}

/** What the app shows to identify a token after creation, e.g. "mt_Ab3x…". */
export function apiTokenDisplayPrefix(token: string): string {
  return token.slice(0, 7);
}
