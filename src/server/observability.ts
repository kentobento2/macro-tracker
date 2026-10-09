// Rate limiting and request logging for the MCP server.
// Logs never include food descriptions, tool arguments, tokens, or emails: only what's needed to debug
// (tool name, a short user fingerprint, outcome, timing).

import { sha256Hex } from './auth';
import type { Db } from './store';

/** Requests per user per minute. Generous for chat use; stops runaway loops. */
export const RATE_LIMIT_PER_MINUTE = 60;

/** True if the request is allowed. Fails open if the limiter itself is unavailable (logged). */
export async function allowRequest(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db.rpc('mcp_rate_hit', { p_user_id: userId, p_limit: RATE_LIMIT_PER_MINUTE });
  if (error) {
    log({ event: 'rate_limiter_error', code: error.code });
    return true;
  }
  return data === true;
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
