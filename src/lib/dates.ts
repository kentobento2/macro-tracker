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

/** Monday of the calendar week (Mon–Sun) containing `key`. */
export function startOfWeek(key: DateKey): DateKey {
  const day = fromDateKey(key).getDay(); // 0 = Sunday
  return addDays(key, day === 0 ? -6 : 1 - day);
}

/** The seven keys Mon–Sun of the week containing `key`. */
export function weekOf(key: DateKey): DateKey[] {
  const monday = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** e.g. "Oct 5 – 11", or "Sep 28 – Oct 4" across months. */
export function formatWeekRange(key: DateKey): string {
  const [first, last] = [startOfWeek(key), addDays(startOfWeek(key), 6)].map(fromDateKey);
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  return first.getMonth() === last.getMonth()
    ? `${month(first)} ${first.getDate()} – ${last.getDate()}`
    : `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}`;
}

/** Whole calendar days from `a` to `b` (negative if b is before a). DST-safe. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** A friendly greeting for the local hour (0–23), shown above today's log. */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Hello, night owl';
}
