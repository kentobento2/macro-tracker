import {
  addDays,
  daysBetween,
  daysEnding,
  formatDayLabel,
  formatWeekRange,
  fromDateKey,
  isDateKey,
  startOfWeek,
  toDateKey,
  weekOf,
} from '../dates';

describe('date keys', () => {
  it('formats local dates', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('round-trips', () => {
    expect(toDateKey(fromDateKey('2026-10-08'))).toBe('2026-10-08');
  });
  it('validates', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('nope')).toBe(false);
  });
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('lists the week ending on a day, oldest first', () => {
    expect(daysEnding('2026-10-08', 7)).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
  });
  it('labels today and yesterday', () => {
    expect(formatDayLabel('2026-10-08', '2026-10-08')).toBe('Today');
    expect(formatDayLabel('2026-10-07', '2026-10-08')).toBe('Yesterday');
    expect(formatDayLabel('2026-10-06', '2026-10-08')).toBe('Tue, Oct 6');
  });
});

describe('calendar weeks (Mon–Sun)', () => {
  it('finds Monday for every day of the week', () => {
    // 2026-10-05 is a Monday, 2026-10-11 a Sunday.
    for (const d of ['2026-10-05', '2026-10-08', '2026-10-10', '2026-10-11']) {
      expect(startOfWeek(d)).toBe('2026-10-05');
    }
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
  });
  it('crosses month and year boundaries', () => {
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // Sunday
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29'); // Thursday
  });
  it('lists Mon–Sun', () => {
    expect(weekOf('2026-10-08')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });
  it('formats week ranges', () => {
    expect(formatWeekRange('2026-10-08')).toBe('Oct 5 – 11');
    expect(formatWeekRange('2026-10-01')).toBe('Sep 28 – Oct 4');
  });
});

describe('daysBetween', () => {
  it('counts calendar days, across DST and years', () => {
    expect(daysBetween('2026-10-08', '2026-10-08')).toBe(0);
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
    expect(daysBetween('2026-10-08', '2026-10-01')).toBe(-7);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2); // US DST starts Mar 8
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
});
