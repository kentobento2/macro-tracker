// Rate limiting and request logging for the MCP server.
// Logs never include food descriptions, tool arguments, tokens, or emails: only what's needed to debug
// (tool name, a short user fingerprint, outcome, timing).

import { sha256Hex } from './auth';
import type { Db } from './store';

/** Requests per user per minute. Generous for chat use; stops runaway loops. */
export const RATE_LIMIT_PER_MINUTE = 60;

export type RateDecision = 'allowed' | 'limited' | 'unavailable';

/**
 * Counts the request against the user's per-minute limit. Fails closed: if the limiter can't be reached
 * (logged), the request is refused, since the database the tools need is most likely down too.
 */
export async function checkRateLimit(db: Db, userId: string): Promise<RateDecision> {
  const { data, error } = await db.rpc('mcp_rate_hit', { p_user_id: userId, p_limit: RATE_LIMIT_PER_MINUTE });
  if (error) {
    log({ event: 'rate_limiter_error', code: error.code });
    return 'unavailable';
  }
  return data === true ? 'allowed' : 'limited';
}

/** Stable, non-reversible short id so logs can be correlated per user without storing who they are. */
export const userFingerprint = async (userId: string) => (await sha256Hex(`mt-log:${userId}`)).slice(0, 10);

type LogFields = {
  event: string;
  user?: string;
  tool?: string;
  via?: string;
  ok?: boolean;
  error_kind?: string;
  status?: number;
  ms?: number;
  code?: string;
};

export function log(fields: LogFields) {
  console.log(JSON.stringify({ at: new Date().toISOString(), svc: 'mcp', ...fields }));
}
