import type { WeighIn } from '../bodyweight';
import { buildWeightChart, dateLabel, nearestDot, niceTicks, type ChartBox } from '../weight-chart';

const w = (date: string, weightKg: number): WeighIn => ({ date, weightKg, note: null });
// Box with an easy-to-check plot area: x 0..100, y 0..100.
const box: ChartBox = { width: 100, height: 100, left: 0, right: 0, top: 0, bottom: 0 };
const today = '2026-10-08';

describe('niceTicks', () => {
  it('picks round steps covering the data', () => {
    expect(niceTicks(179.2, 182.1)).toEqual([179, 180, 181, 182, 183]);
    expect(niceTicks(80.1, 80.9)).toEqual([80, 80.2, 80.4, 80.6, 80.8, 81]);
  });
  it('widens flat data to a ±1 window', () => {
    expect(niceTicks(80, 80)).toEqual([79, 79.5, 80, 80.5, 81]);
  });
});

describe('buildWeightChart', () => {
  it('returns null when no weigh-ins fall in the range', () => {
    expect(buildWeightChart({ weighIns: [w('2026-01-01', 80)], range: '1W', today, unit: 'metric', box })).toBeNull();
  });

  it('places dots by calendar day across the range and value on the y axis', () => {
    // 1W: Oct 2 .. Oct 8 → 6 days wide.
    const chart = buildWeightChart({
      weighIns: [w('2026-10-02', 80), w('2026-10-05', 81), w('2026-10-08', 82)],
      range: '1W',
      today,
      unit: 'metric',
      box,
    })!;
    expect(chart.startDate).toBe('2026-10-02');
    expect(chart.dots.map((d) => d.x)).toEqual([0, 50, 100]);
    // ticks 80..82 (step 0.5) → 80 at bottom (y=100), 82 at top (y=0)
    expect(chart.dots[0].y).toBe(100);
    expect(chart.dots[2].y).toBe(0);
    expect(chart.yTicks[0]).toEqual({ y: 100, label: '80' });
  });

  it('includes earlier weigh-ins in the rolling average at the left edge', () => {
    const chart = buildWeightChart({
      weighIns: [w('2026-09-30', 90), w('2026-10-02', 80)],
      range: '1W',
      today,
      unit: 'metric',
      box,
    })!;
    expect(chart.dots).toHaveLength(1); // Sep 30 is outside the range…
    expect(chart.dots[0].average).toBe(85); // …but counts toward Oct 2's 7-day average
  });

  it('breaks the average line across gaps longer than a week', () => {
    const chart = buildWeightChart({
      weighIns: [w('2026-09-01', 80), w('2026-09-03', 80), w('2026-09-20', 79), w('2026-09-21', 79)],
      range: 'All',
      today,
      unit: 'metric',
      box,
    })!;
    expect(chart.averagePath.match(/M/g)).toHaveLength(2);
    expect(chart.averagePath.match(/L/g)).toHaveLength(2);
  });

  it('All starts at the first weigh-in', () => {
    const chart = buildWeightChart({ weighIns: [w('2026-06-01', 80)], range: 'All', today, unit: 'metric', box })!;
    expect(chart.startDate).toBe('2026-06-01');
    expect(chart.dots[0].x).toBe(0);
  });

  it('converts to pounds before choosing ticks', () => {
    const chart = buildWeightChart({ weighIns: [w('2026-10-08', 81.647)], range: '1W', today, unit: 'imperial', box })!;
    expect(chart.dots[0].value).toBeCloseTo(180);
    expect(chart.yTicks.map((t) => t.label)).toEqual(['179', '179.5', '180', '180.5', '181']);
  });

  it('handles a single weigh-in today', () => {
    const chart = buildWeightChart({ weighIns: [w(today, 80)], range: 'All', today, unit: 'metric', box })!;
    expect(chart.dots).toHaveLength(1);
    expect(Number.isFinite(chart.dots[0].x)).toBe(true);
  });
});

describe('nearestDot', () => {
  it('finds the closest dot horizontally', () => {
    const dots = [10, 50, 90].map((x) => ({ x, y: 0, date: `d${x}`, value: 0, average: null }));
    expect(nearestDot(dots, 62)?.x).toBe(50);
    expect(nearestDot([], 5)).toBeNull();
  });
});

describe('dateLabel', () => {
  it('uses month + day for short spans and month + year for long ones', () => {
    expect(dateLabel('2026-09-09', 30)).toBe('Sep 9');
    expect(dateLabel('2025-10-09', 365)).toBe('Oct ’25');
  });
});
