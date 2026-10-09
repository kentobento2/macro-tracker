// Calendar dates in a user's IANA timezone. Pure: callers pass `now`.

import type { DateKey } from './dates';

export const DEFAULT_TIME_ZONE = 'Pacific/Honolulu';

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) at instant `now` in timezone `tz` (falls back to the default zone). */
export function dateKeyInTimeZone(now: Date, tz: string): DateKey {
  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
