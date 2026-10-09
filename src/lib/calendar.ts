// Month grids for the calendar picker. Pure. Weeks run Monday–Sunday to match weekly averages.

import { addDays, fromDateKey, startOfWeek, toDateKey, type DateKey } from './dates';

export type MonthKey = string; // YYYY-MM

export type CalendarCell = { date: DateKey; inMonth: boolean };

export const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export function monthOf(date: DateKey): MonthKey {
  return date.slice(0, 7);
}

export function firstOfMonth(month: MonthKey): DateKey {
  return `${month}-01`;
}

export function lastOfMonth(month: MonthKey): DateKey {
  const [y, m] = month.split('-').map(Number);
  return toDateKey(new Date(y, m, 0)); // day 0 of next month = last day of this one
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  return toDateKey(new Date(y, m - 1 + n, 1)).slice(0, 7);
}

/** Every date in the month, in order. */
export function daysInMonth(month: MonthKey): DateKey[] {
  const last = lastOfMonth(month);
  const out: DateKey[] = [];
  for (let d = firstOfMonth(month); d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Whole Mon–Sun weeks covering the month (4–6 rows), with leading/trailing days from adjacent months. */
export function monthGrid(month: MonthKey): CalendarCell[][] {
  const last = lastOfMonth(month);
  const weeks: CalendarCell[][] = [];
  for (let start = startOfWeek(firstOfMonth(month)); start <= last; start = addDays(start, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        return { date, inMonth: monthOf(date) === month };
      })
    );
  }
  return weeks;
}

/** e.g. "October 2026". */
export function formatMonth(month: MonthKey): string {
  return fromDateKey(firstOfMonth(month)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
