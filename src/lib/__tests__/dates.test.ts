import { addDays, daysEnding, formatDayLabel, fromDateKey, isDateKey, toDateKey } from '../dates';

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
