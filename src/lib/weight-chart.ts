// Geometry for the weight chart. Pure: dates/weights in, pixel coordinates and labels out.
// Values are converted to the display unit first so axis ticks land on round lb or kg.

import { inRange, rangeStart, rollingAverage, type RangeKey, type WeighIn } from './bodyweight';
import { addDays, daysBetween, fromDateKey, type DateKey } from './dates';
import { KG_PER_POUND } from './units';

export type ChartBox = { width: number; height: number; left: number; right: number; top: number; bottom: number };

export type ChartDot = { x: number; y: number; date: DateKey; value: number; average: number | null };

export type WeightChart = {
  dots: ChartDot[];
  /** SVG path for the rolling average; separate segments where weigh-ins are >7 days apart. */
  averagePath: string;
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  startDate: DateKey;
  endDate: DateKey;
};

const NICE_STEPS = [0.2, 0.5, 1, 2, 5, 10, 20, 50];

/** Round axis ticks covering [min, max], about `target` of them. Flat data gets a ±1 window. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  let lo = min;
  let hi = max;
  if (hi - lo < 0.05) {
    // Flat data: center a ±1 window on the (rounded) value so unit conversion noise doesn't skew it.
    const mid = Math.round(((lo + hi) / 2) * 10) / 10;
    lo = mid - 1;
    hi = mid + 1;
  }
  // Small tolerance: 0.8 / 0.2 is 4.000000000000001 in floating point.
  const step = NICE_STEPS.find((s) => (hi - lo) / s <= target + 1e-9) ?? NICE_STEPS[NICE_STEPS.length - 1];
  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const toUnit = (kg: number, unit: 'metric' | 'imperial') => (unit === 'imperial' ? kg / KG_PER_POUND : kg);

const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** "Sep 9" for short spans; "Oct ’25" once the axis covers more than ~6 months (so "Oct 9 … Oct 8" can't read backwards). */
export function dateLabel(d: DateKey, spanDays: number): string {
  const date = fromDateKey(d);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return spanDays > 180 ? `${month} ’${String(date.getFullYear()).slice(2)}` : `${month} ${date.getDate()}`;
}

export function buildWeightChart(args: {
  weighIns: readonly WeighIn[];
  range: RangeKey;
  today: DateKey;
  unit: 'metric' | 'imperial';
  box: ChartBox;
}): WeightChart | null {
  const { weighIns, range, today, unit, box } = args;
  const visible = inRange(weighIns, range, today);
  if (visible.length === 0) return null;

  // Rolling average uses all history, so the line at the left edge includes earlier weigh-ins.
  const averages = new Map(rollingAverage(weighIns.filter((w) => w.date <= today)).map((p) => [p.date, p.averageKg]));

  const startDate = rangeStart(range, today) ?? visible[0].date;
  const endDate = today;
  const span = Math.max(1, daysBetween(startDate, endDate));

  const values = visible.flatMap((w) => {
    const avg = averages.get(w.date);
    return avg === undefined ? [toUnit(w.weightKg, unit)] : [toUnit(w.weightKg, unit), toUnit(avg, unit)];
  });
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const plotW = box.width - box.left - box.right;
  const plotH = box.height - box.top - box.bottom;
  const x = (d: DateKey) => box.left + (daysBetween(startDate, d) / span) * plotW;
  const y = (v: number) => box.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const dots: ChartDot[] = visible.map((w) => {
    const avgKg = averages.get(w.date);
    const value = toUnit(w.weightKg, unit);
    return {
      x: r1(x(w.date)),
      y: r1(y(value)),
      date: w.date,
      value,
      average: avgKg === undefined ? null : toUnit(avgKg, unit),
    };
  });

  let averagePath = '';
  dots.forEach((dot, i) => {
    if (dot.average === null) return;
    const gap = i > 0 && daysBetween(dots[i - 1].date, dot.date) > 7;
    averagePath += `${averagePath === '' || gap ? 'M' : 'L'}${dot.x},${r1(y(dot.average))} `;
  });

  // Up to 4 evenly spaced date labels.
  const xCount = Math.min(4, span + 1);
  const xTicks = Array.from({ length: xCount }, (_, i) => {
    const d = addDays(startDate, Math.round((i * span) / Math.max(1, xCount - 1)));
    return { x: r1(x(d)), label: dateLabel(d, span) };
  });

  return {
    dots,
    averagePath: averagePath.trim(),
    yTicks: ticks.map((v) => ({ y: r1(y(v)), label: fmtTick(v) })),
    xTicks,
    startDate,
    endDate,
  };
}

/** The dot nearest to a tap's x position. */
export function nearestDot(dots: readonly ChartDot[], tapX: number): ChartDot | null {
  let best: ChartDot | null = null;
  for (const d of dots) if (!best || Math.abs(d.x - tapX) < Math.abs(best.x - tapX)) best = d;
  return best;
}
