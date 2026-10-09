// Calendar dates as local "YYYY-MM-DD" keys. Pure: callers pass in `now`.

export type DateKey = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDateKey(s: unknown): s is DateKey {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateKey(fromDateKey(s)) === s;
}

/** Local midnight of the key. */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** The `count` consecutive keys ending at (and including) `end`, oldest first. */
export function daysEnding(end: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)));
}

/** "Today", "Yesterday", or e.g. "Mon, Oct 6". */
export function formatDayLabel(key: DateKey, today: DateKey): string {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return fromDateKey(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
