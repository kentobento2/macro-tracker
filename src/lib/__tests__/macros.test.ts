import {
  averageNutrition,
  caloriesFromMacros,
  nutritionForGrams,
  progress,
  remainingNutrition,
  scaleNutrition,
  sumNutrition,
  ZERO_NUTRITION,
} from '../macros';

const n = (calories: number, protein: number, carbs: number, fat: number) => ({ calories, protein, carbs, fat });

describe('caloriesFromMacros', () => {
  it('uses 4/4/9 kcal per gram', () => {
    expect(caloriesFromMacros({ protein: 10, carbs: 20, fat: 5 })).toBe(40 + 80 + 45);
  });
  it('is zero for zero macros', () => {
    expect(caloriesFromMacros(ZERO_NUTRITION)).toBe(0);
  });
});

describe('sumNutrition', () => {
  it('returns zero for an empty list', () => {
    expect(sumNutrition([])).toEqual(ZERO_NUTRITION);
  });
  it('adds each field independently', () => {
    expect(sumNutrition([n(100, 10, 5, 2), n(250, 5, 40, 12)])).toEqual(n(350, 15, 45, 14));
  });
});

describe('scaleNutrition / nutritionForGrams', () => {
  it('scales by factor', () => {
    expect(scaleNutrition(n(100, 10, 4, 2), 1.5)).toEqual(n(150, 15, 6, 3));
  });
  it('converts per-100g values to a portion', () => {
    // Banana, raw (USDA SR Legacy 173944): 89 kcal, 1.09 P, 22.8 C, 0.33 F per 100 g
    const r = nutritionForGrams(n(89, 1.09, 22.8, 0.33), 126);
    expect(r.calories).toBeCloseTo(112.14);
    expect(r.protein).toBeCloseTo(1.3734);
    expect(r.carbs).toBeCloseTo(28.728);
    expect(r.fat).toBeCloseTo(0.4158);
  });
  it('rejects negative or non-finite input', () => {
    expect(() => scaleNutrition(ZERO_NUTRITION, -1)).toThrow(RangeError);
    expect(() => nutritionForGrams(ZERO_NUTRITION, NaN)).toThrow(RangeError);
  });
});

describe('remainingNutrition', () => {
  it('goes negative when over target', () => {
    expect(remainingNutrition(n(2000, 150, 200, 60), n(2100, 160, 100, 60))).toEqual(n(-100, -10, 100, 0));
  });
});

describe('averageNutrition', () => {
  it('is zero for no days', () => {
    expect(averageNutrition([])).toEqual(ZERO_NUTRITION);
  });
  it('averages days', () => {
    expect(averageNutrition([n(2000, 100, 200, 50), n(1000, 50, 100, 30)])).toEqual(n(1500, 75, 150, 40));
  });
});

describe('progress', () => {
  it('clamps to [0, 1]', () => {
    expect(progress(50, 100)).toBe(0.5);
    expect(progress(150, 100)).toBe(1);
    expect(progress(-5, 100)).toBe(0);
  });
  it('treats a missing target as no progress', () => {
    expect(progress(50, 0)).toBe(0);
  });
});
