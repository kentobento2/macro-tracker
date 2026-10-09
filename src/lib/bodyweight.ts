// Bodyweight math. Pure. Weights are canonical kilograms; convert for display only.
//
// Definitions:
// - Week: Monday–Sunday (same as the food log).
// - Weekly average: mean of the weigh-ins inside that week. Days without a weigh-in are ignored,
//   so a week with one weigh-in averages to that weigh-in.
// - Rolling average: for each weigh-in day, the mean of weigh-ins in the 7 calendar days ending that
//   day (inclusive). Gaps shrink the sample rather than counting as zero.
// - Week-over-week change: this week's average minus the most recent earlier week that has data.

import { addDays, startOfWeek, type DateKey } from './dates';
import { KG_PER_POUND } from './units';

export type WeighIn = {
  date: DateKey;
  weightKg: number;
  note: string | null;
};

export type WeekAverage = {
  weekStart: DateKey; // Monday
  averageKg: number;
  count: number;
};

export type RangeKey = '1W' | '1M' | '3M' | '6M' | '1Y' | 'All';

export const RANGES: readonly RangeKey[] = ['1W', '1M', '3M', '6M', '1Y', 'All'];

/** Days covered by each range, ending today (inclusive). */
export const RANGE_DAYS: Record<Exclude<RangeKey, 'All'>, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
};

export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const byDate = (a: WeighIn, b: WeighIn) => a.date.localeCompare(b.date);

/** Insert or replace the weigh-in for its day (one per day). Returns a new list sorted by date. */
export function upsertWeighIn(list: readonly WeighIn[], entry: WeighIn): WeighIn[] {
  return [...list.filter((w) => w.date !== entry.date), entry].sort(byDate);
}

export function removeWeighIn(list: readonly WeighIn[], date: DateKey): WeighIn[] {
  return list.filter((w) => w.date !== date);
}

/** Averages for every week that has at least one weigh-in, oldest first. */
export function weeklyAverages(list: readonly WeighIn[]): WeekAverage[] {
  const groups = new Map<DateKey, number[]>();
  for (const w of list) {
    const week = startOfWeek(w.date);
    groups.set(week, [...(groups.get(week) ?? []), w.weightKg]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weights]) => ({ weekStart, averageKg: mean(weights), count: weights.length }));
}

/** Rolling mean over the `windowDays` calendar days ending on each weigh-in day. Oldest first. */
export function rollingAverage(
  list: readonly WeighIn[],
  windowDays = 7
): { date: DateKey; averageKg: number; count: number }[] {
  const sorted = [...list].sort(byDate);
  return sorted.map((w) => {
    const from = addDays(w.date, -(windowDays - 1));
    const inWindow = sorted.filter((x) => x.date >= from && x.date <= w.date).map((x) => x.weightKg);
    return { date: w.date, averageKg: mean(inWindow), count: inWindow.length };
  });
}

/**
 * This week's average vs the most recent earlier week with data.
 * `current` is null when there's no weigh-in yet this week; `change` is null unless both exist.
 */
export function weekOverWeek(
  list: readonly WeighIn[],
  today: DateKey
): { current: WeekAverage | null; previous: WeekAverage | null; changeKg: number | null } {
  const thisWeek = startOfWeek(today);
  const weeks = weeklyAverages(list.filter((w) => w.date <= today));
  const current = weeks.find((w) => w.weekStart === thisWeek) ?? null;
  const earlier = weeks.filter((w) => w.weekStart < thisWeek);
  const previous = earlier.length ? earlier[earlier.length - 1] : null;
  return {
    current,
    previous,
    changeKg: current && previous ? current.averageKg - previous.averageKg : null,
  };
}

/** First day included by a range ending today, or null for All. */
export function rangeStart(range: RangeKey, today: DateKey): DateKey | null {
  return range === 'All' ? null : addDays(today, -(RANGE_DAYS[range] - 1));
}

export function inRange(list: readonly WeighIn[], range: RangeKey, today: DateKey): WeighIn[] {
  const start = rangeStart(range, today);
  return list.filter((w) => w.date <= today && (start === null || w.date >= start)).sort(byDate);
}

/** History list: weeks newest first, each with its average and its weigh-ins newest first. */
export function groupByWeek(list: readonly WeighIn[]): (WeekAverage & { entries: WeighIn[] })[] {
  return weeklyAverages(list)
    .reverse()
    .map((week) => ({
      ...week,
      entries: list.filter((w) => startOfWeek(w.date) === week.weekStart).sort((a, b) => byDate(b, a)),
    }));
}

export function isValidWeightKg(kg: number): boolean {
  return Number.isFinite(kg) && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

// ---------- Offline queue (same model as food entries, keyed by day) ----------

export type WeightOp = { kind: 'upsert'; weighIn: WeighIn } | { kind: 'delete'; date: DateKey };

const opDate = (op: WeightOp) => (op.kind === 'upsert' ? op.weighIn.date : op.date);

/** Add an op, dropping earlier pending ops for the same day (last write wins). */
export function enqueueWeightOp(queue: readonly WeightOp[], op: WeightOp): WeightOp[] {
  return [...queue.filter((q) => opDate(q) !== opDate(op)), op];
}

/** Server-confirmed weigh-ins with pending local changes applied. */
export function applyWeightOps(list: readonly WeighIn[], queue: readonly WeightOp[]): WeighIn[] {
  return queue.reduce<WeighIn[]>(
    (acc, op) => (op.kind === 'upsert' ? upsertWeighIn(acc, op.weighIn) : removeWeighIn(acc, op.date)),
    [...list].sort(byDate)
  );
}

// ---------- Input ----------

/** Parse a typed weight in the user's units into canonical kg (3 decimals), or null if invalid. */
export function parseWeightInput(text: string, unitSystem: 'metric' | 'imperial'): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const value = Number(t);
  const kg = unitSystem === 'imperial' ? value * KG_PER_POUND : value;
  const rounded = Math.round(kg * 1000) / 1000;
  return isValidWeightKg(rounded) ? rounded : null;
}
