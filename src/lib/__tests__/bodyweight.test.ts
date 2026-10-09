import {
  applyWeightOps,
  enqueueWeightOp,
  groupByWeek,
  inRange,
  isValidWeightKg,
  parseWeightInput,
  rangeStart,
  removeWeighIn,
  rollingAverage,
  upsertWeighIn,
  weekOverWeek,
  weeklyAverages,
  type WeighIn,
} from '../bodyweight';

const w = (date: string, weightKg: number, note: string | null = null): WeighIn => ({ date, weightKg, note });

// Calendar reference: 2026-10-05 is a Monday; 2026-10-11 a Sunday.

describe('upsertWeighIn / removeWeighIn', () => {
  it('keeps one weigh-in per day, replacing the old one', () => {
    let list = upsertWeighIn([], w('2026-10-06', 80));
    list = upsertWeighIn(list, w('2026-10-05', 81));
    list = upsertWeighIn(list, w('2026-10-06', 79.5, 'after run'));
    expect(list).toEqual([w('2026-10-05', 81), w('2026-10-06', 79.5, 'after run')]);
  });
  it('removes by day', () => {
    expect(removeWeighIn([w('2026-10-05', 81), w('2026-10-06', 80)], '2026-10-05')).toEqual([w('2026-10-06', 80)]);
  });
});

describe('weeklyAverages', () => {
  it('is empty with no weigh-ins', () => {
    expect(weeklyAverages([])).toEqual([]);
  });

  it('averages within Mon–Sun weeks, ignoring missing days', () => {
    const list = [
      w('2026-10-05', 80), // Mon
      w('2026-10-07', 81), // Wed
      w('2026-10-11', 82), // Sun — still the same week
      w('2026-10-12', 79), // next Mon
    ];
    expect(weeklyAverages(list)).toEqual([
      { weekStart: '2026-10-05', averageKg: 81, count: 3 },
      { weekStart: '2026-10-12', averageKg: 79, count: 1 },
    ]);
  });

  it('a single-entry week averages to that entry', () => {
    expect(weeklyAverages([w('2026-10-08', 77.3)])).toEqual([{ weekStart: '2026-10-05', averageKg: 77.3, count: 1 }]);
  });

  it('skips empty weeks entirely (gaps of several weeks)', () => {
    const weeks = weeklyAverages([w('2026-09-07', 85), w('2026-10-08', 80)]);
    expect(weeks.map((x) => x.weekStart)).toEqual(['2026-09-07', '2026-10-05']);
  });

  it('is order-independent and handles weeks across month/year boundaries', () => {
    const list = [w('2027-01-01', 70), w('2026-12-28', 72)]; // Mon Dec 28 – Sun Jan 3
    expect(weeklyAverages(list)).toEqual([{ weekStart: '2026-12-28', averageKg: 71, count: 2 }]);
  });
});

describe('rollingAverage (7 calendar days)', () => {
  it('averages the weigh-ins in the 7 days ending on each day', () => {
    const list = [w('2026-10-01', 80), w('2026-10-04', 82), w('2026-10-07', 84), w('2026-10-08', 86)];
    expect(rollingAverage(list)).toEqual([
      { date: '2026-10-01', averageKg: 80, count: 1 },
      { date: '2026-10-04', averageKg: 81, count: 2 },
      { date: '2026-10-07', averageKg: 82, count: 3 }, // window Oct 1–7
      { date: '2026-10-08', averageKg: (82 + 84 + 86) / 3, count: 3 }, // Oct 1 drops out
    ]);
  });

  it('after a long gap the average restarts from the new weigh-in', () => {
    const r = rollingAverage([w('2026-09-01', 90), w('2026-10-08', 80)]);
    expect(r[1]).toEqual({ date: '2026-10-08', averageKg: 80, count: 1 });
  });

  it('sorts unsorted input', () => {
    expect(rollingAverage([w('2026-10-02', 2), w('2026-10-01', 1)]).map((p) => p.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('weekOverWeek', () => {
  const today = '2026-10-08'; // Thursday

  it('compares this week to last week', () => {
    const r = weekOverWeek([w('2026-09-29', 82), w('2026-10-01', 82.4), w('2026-10-06', 81), w('2026-10-08', 81.4)], today);
    expect(r.current).toEqual({ weekStart: '2026-10-05', averageKg: 81.2, count: 2 });
    expect(r.previous).toEqual({ weekStart: '2026-09-28', averageKg: 82.2, count: 2 });
    expect(r.changeKg).toBeCloseTo(-1);
  });

  it('falls back to the most recent earlier week with data when last week is empty', () => {
    const r = weekOverWeek([w('2026-09-15', 84), w('2026-10-07', 83)], today);
    expect(r.previous?.weekStart).toBe('2026-09-14');
    expect(r.changeKg).toBeCloseTo(-1);
  });

  it('has no current week before the first weigh-in of the week', () => {
    const r = weekOverWeek([w('2026-10-01', 80)], today);
    expect(r.current).toBeNull();
    expect(r.previous?.averageKg).toBe(80);
    expect(r.changeKg).toBeNull();
  });

  it('has no change for the very first week', () => {
    const r = weekOverWeek([w('2026-10-06', 80)], today);
    expect(r.current?.averageKg).toBe(80);
    expect(r.previous).toBeNull();
    expect(r.changeKg).toBeNull();
  });

  it('is all null with no data', () => {
    expect(weekOverWeek([], today)).toEqual({ current: null, previous: null, changeKg: null });
  });

  it('ignores future-dated entries', () => {
    const r = weekOverWeek([w('2026-10-06', 80), w('2026-10-10', 70)], today);
    expect(r.current?.averageKg).toBe(80);
  });
});

describe('ranges', () => {
  const today = '2026-10-08';
  const list = [w('2025-01-01', 90), w('2026-07-01', 85), w('2026-09-20', 82), w('2026-10-02', 81), w('2026-10-08', 80)];

  it('computes range starts, inclusive of today', () => {
    expect(rangeStart('1W', today)).toBe('2026-10-02');
    expect(rangeStart('1M', today)).toBe('2026-09-09');
    expect(rangeStart('All', today)).toBeNull();
  });

  it('filters and sorts by range', () => {
    expect(inRange(list, '1W', today).map((x) => x.date)).toEqual(['2026-10-02', '2026-10-08']);
    expect(inRange(list, '1M', today)).toHaveLength(3);
    expect(inRange(list, '6M', today)).toHaveLength(4);
    expect(inRange(list, 'All', today)).toHaveLength(5);
  });
});

describe('groupByWeek', () => {
  it('lists weeks newest first with entries newest first', () => {
    const groups = groupByWeek([w('2026-09-29', 82), w('2026-10-06', 81), w('2026-10-08', 80)]);
    expect(groups.map((g) => g.weekStart)).toEqual(['2026-10-05', '2026-09-28']);
    expect(groups[0].entries.map((e) => e.date)).toEqual(['2026-10-08', '2026-10-06']);
    expect(groups[0].averageKg).toBe(80.5);
    expect(groups[1].count).toBe(1);
  });
});

describe('isValidWeightKg', () => {
  it('accepts plausible weights only', () => {
    expect(isValidWeightKg(81.6)).toBe(true);
    expect(isValidWeightKg(10)).toBe(false);
    expect(isValidWeightKg(NaN)).toBe(false);
  });
});

describe('offline weight queue', () => {
  it('keeps the last op per day', () => {
    let q = enqueueWeightOp([], { kind: 'upsert', weighIn: w('2026-10-08', 80) });
    q = enqueueWeightOp(q, { kind: 'upsert', weighIn: w('2026-10-07', 81) });
    q = enqueueWeightOp(q, { kind: 'delete', date: '2026-10-08' });
    expect(q).toEqual([
      { kind: 'upsert', weighIn: w('2026-10-07', 81) },
      { kind: 'delete', date: '2026-10-08' },
    ]);
  });

  it('applies pending upserts and deletes over the server list', () => {
    const server = [w('2026-10-06', 82), w('2026-10-08', 80)];
    const view = applyWeightOps(server, [
      { kind: 'upsert', weighIn: w('2026-10-08', 79.8, 'edited') },
      { kind: 'delete', date: '2026-10-06' },
      { kind: 'upsert', weighIn: w('2026-10-07', 81) },
    ]);
    expect(view).toEqual([w('2026-10-07', 81), w('2026-10-08', 79.8, 'edited')]);
  });
});

describe('parseWeightInput', () => {
  it('converts pounds to kg with 3 decimals', () => {
    expect(parseWeightInput('180', 'imperial')).toBe(81.647);
    expect(parseWeightInput('180.4', 'imperial')).toBe(81.828);
  });
  it('accepts kg and comma decimals', () => {
    expect(parseWeightInput('81,6', 'metric')).toBe(81.6);
  });
  it('rejects junk and implausible values', () => {
    expect(parseWeightInput('', 'metric')).toBeNull();
    expect(parseWeightInput('abc', 'metric')).toBeNull();
    expect(parseWeightInput('5', 'imperial')).toBeNull();
    expect(parseWeightInput('-80', 'metric')).toBeNull();
  });
});
