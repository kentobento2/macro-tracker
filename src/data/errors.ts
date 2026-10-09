type SupabaseResult = { error: { code?: string | null } | null; status?: number };

/**
 * Should a failed write stay queued and be retried later?
 * - Network failure (offline, DNS, timeout): supabase-js reports no error code.
 * - Expired/invalid session (401, PostgREST PGRST3xx): retry after the token refreshes.
 * - Server errors (5xx): temporary.
 * Anything else (e.g. a check constraint violation) is a permanent rejection.
 */
export function isRetryable({ error, status }: SupabaseResult): boolean {
  if (!error) return false;
  if (!error.code) return true;
  if (status === 401 || error.code.startsWith('PGRST3')) return true;
  return status !== undefined && status >= 500;
}
