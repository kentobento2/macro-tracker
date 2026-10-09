import {
  caloriesFromMacros,
  remainingMacros,
  scaleMacros,
  sumMacros,
  ZERO_MACROS,
} from '../macros';

describe('caloriesFromMacros', () => {
  it('uses 4/4/9 kcal per gram', () => {
    expect(caloriesFromMacros({ protein: 10, carbs: 20, fat: 5 })).toBe(40 + 80 + 45);
  });

  it('is zero for zero macros', () => {
    expect(caloriesFromMacros(ZERO_MACROS)).toBe(0);
  });
});

describe('sumMacros', () => {
  it('returns zero for an empty list', () => {
    expect(sumMacros([])).toEqual(ZERO_MACROS);
  });

  it('adds each macro independently', () => {
    expect(
      sumMacros([
        { protein: 30, carbs: 10, fat: 5 },
        { protein: 5, carbs: 40, fat: 12 },
      ])
    ).toEqual({ protein: 35, carbs: 50, fat: 17 });
  });
});

describe('scaleMacros', () => {
  it('multiplies by servings', () => {
    expect(scaleMacros({ protein: 10, carbs: 4, fat: 2 }, 1.5)).toEqual({
      protein: 15,
      carbs: 6,
      fat: 3,
    });
  });

  it('rejects negative or non-finite servings', () => {
    expect(() => scaleMacros(ZERO_MACROS, -1)).toThrow(RangeError);
    expect(() => scaleMacros(ZERO_MACROS, NaN)).toThrow(RangeError);
  });
});

describe('remainingMacros', () => {
  it('goes negative when over target', () => {
    expect(
      remainingMacros({ protein: 150, carbs: 200, fat: 60 }, { protein: 160, carbs: 100, fat: 60 })
    ).toEqual({ protein: -10, carbs: 100, fat: 0 });
  });
});
