import {
  addMonths,
  daysInMonth,
  firstOfMonth,
  formatMonth,
  lastOfMonth,
  monthGrid,
  monthOf,
} from '../calendar';

describe('month helpers', () => {
  it('finds month bounds, including leap years', () => {
    expect(monthOf('2026-10-08')).toBe('2026-10');
    expect(firstOfMonth('2026-10')).toBe('2026-10-01');
    expect(lastOfMonth('2026-10')).toBe('2026-10-31');
    expect(lastOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastOfMonth('2028-02')).toBe('2028-02-29');
  });

  it('adds months across years', () => {
    expect(addMonths('2026-10', 1)).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -14)).toBe('2025-01');
  });

  it('lists every day of the month', () => {
    const days = daysInMonth('2026-02');
    expect(days).toHaveLength(28);
    expect(days[0]).toBe('2026-02-01');
    expect(days[27]).toBe('2026-02-28');
  });

  it('formats month names', () => {
    expect(formatMonth('2026-10')).toBe('October 2026');
  });
});

describe('monthGrid', () => {
  it('pads October 2026 (starts Thursday) with late-September days', () => {
    const grid = monthGrid('2026-10');
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toEqual({ date: '2026-09-28', inMonth: false });
    expect(grid[0][3]).toEqual({ date: '2026-10-01', inMonth: true });
    expect(grid[4][6]).toEqual({ date: '2026-11-01', inMonth: false });
  });

  it('every row is a full Mon–Sun week', () => {
    for (const month of ['2026-02', '2026-03', '2026-06', '2026-08', '2026-11']) {
      const grid = monthGrid(month);
      for (const week of grid) {
        expect(week).toHaveLength(7);
        expect(new Date(`${week[0].date}T12:00:00`).getDay()).toBe(1); // Monday
      }
      expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(daysInMonth(month).length);
    }
  });

  it('uses exactly four rows when February starts on a Monday', () => {
    // Feb 2027 starts Monday and has 28 days.
    expect(monthGrid('2027-02')).toHaveLength(4);
  });

  it('uses six rows when needed', () => {
    // Aug 2026 starts Saturday and has 31 days.
    expect(monthGrid('2026-08')).toHaveLength(6);
  });
});
