import {
  averageOverLoggedDays,
  buildEntry,
  entriesByMeal,
  entryNutrition,
  foodFromEntry,
  mealForTime,
  recentFoods,
  totalNutrition,
  totalsByMeal,
  type FoodEntry,
} from '../entries';
import type { FoodItem } from '../foods';

const rice: FoodItem = {
  source: 'usda',
  sourceId: '169756',
  name: 'Rice, white, cooked',
  brand: null,
  per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  servings: [{ label: '1 cup', grams: 158 }],
  caloriesDerived: false,
};

const chicken: FoodItem = {
  source: 'usda',
  sourceId: '171477',
  name: 'Chicken breast, cooked',
  brand: null,
  per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  servings: [],
  caloriesDerived: false,
};

let n = 0;
function entry(food: FoodItem, overrides: Partial<Parameters<typeof buildEntry>[0]> = {}): FoodEntry {
  n += 1;
  return buildEntry({
    id: `id-${n}`,
    date: '2026-10-08',
    meal: 'lunch',
    food,
    portion: { quantity: 100, unit: 'g' },
    createdAt: `2026-10-08T12:00:${String(n).padStart(2, '0')}Z`,
    ...overrides,
  });
}

describe('buildEntry', () => {
  it('computes grams from servings and keeps the serving used', () => {
    const e = entry(rice, { portion: { quantity: 1.5, unit: 'serving', serving: rice.servings[0] } });
    expect(e.grams).toBe(237);
    expect(e.serving).toEqual({ label: '1 cup', grams: 158 });
  });

  it('computes grams from ounces and drops the serving', () => {
    const e = entry(chicken, { portion: { quantity: 4, unit: 'oz', serving: { label: 'x', grams: 1 } } });
    expect(e.grams).toBeCloseTo(113.398);
    expect(e.serving).toBeNull();
  });

  it('rejects zero portions', () => {
    expect(() => entry(rice, { portion: { quantity: 0, unit: 'g' } })).toThrow(RangeError);
  });
});

describe('nutrition totals', () => {
  it('computes an entry from per-100g values', () => {
    const e = entry(chicken, { portion: { quantity: 150, unit: 'g' } });
    expect(entryNutrition(e)).toEqual({ calories: 247.5, protein: 46.5, carbs: 0, fat: 5.4 });
  });

  it('totals a day and splits by meal', () => {
    const a = entry(rice, { meal: 'lunch', portion: { quantity: 200, unit: 'g' } });
    const b = entry(chicken, { meal: 'dinner', portion: { quantity: 100, unit: 'g' } });
    expect(totalNutrition([a, b]).calories).toBeCloseTo(260 + 165);
    const byMeal = totalsByMeal([a, b]);
    expect(byMeal.lunch.calories).toBeCloseTo(260);
    expect(byMeal.dinner.calories).toBeCloseTo(165);
    expect(byMeal.breakfast.calories).toBe(0);
  });

  it('groups entries by meal in logged order', () => {
    const late = entry(rice, { createdAt: '2026-10-08T13:00:00Z' });
    const early = entry(chicken, { createdAt: '2026-10-08T08:00:00Z' });
    expect(entriesByMeal([late, early]).lunch.map((e) => e.id)).toEqual([early.id, late.id]);
  });
});

describe('averageOverLoggedDays', () => {
  it('averages only days with entries inside the window', () => {
    const d1 = entry(chicken, { date: '2026-10-06', portion: { quantity: 100, unit: 'g' } }); // 165
    const d2a = entry(chicken, { date: '2026-10-08', portion: { quantity: 100, unit: 'g' } }); // 165
    const d2b = entry(rice, { date: '2026-10-08', portion: { quantity: 100, unit: 'g' } }); // 130
    const outside = entry(rice, { date: '2026-09-01' });
    const { average, daysLogged } = averageOverLoggedDays(
      [d1, d2a, d2b, outside],
      ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']
    );
    expect(daysLogged).toBe(2);
    expect(average.calories).toBeCloseTo((165 + 295) / 2);
  });

  it('is zero with nothing logged', () => {
    expect(averageOverLoggedDays([], ['2026-10-08'])).toEqual({
      average: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      daysLogged: 0,
    });
  });
});

describe('foodFromEntry', () => {
  it('keeps all servings so edits and re-logs can use them', () => {
    const e = entry(rice, { portion: { quantity: 200, unit: 'g' } });
    expect(foodFromEntry(e).servings).toEqual([{ label: '1 cup', grams: 158 }]);
  });
  it('includes the serving used even if missing from the list', () => {
    const e = { ...entry(chicken), unit: 'serving' as const, serving: { label: '1 breast', grams: 172 } };
    expect(foodFromEntry(e).servings).toEqual([{ label: '1 breast', grams: 172 }]);
  });
});

describe('recentFoods', () => {
  it('dedupes by source id, newest first, with limit', () => {
    const r1 = entry(rice, { createdAt: '2026-10-01T00:00:00Z' });
    const c1 = entry(chicken, { createdAt: '2026-10-02T00:00:00Z' });
    const r2 = entry(rice, { createdAt: '2026-10-03T00:00:00Z' });
    const result = recentFoods([r1, c1, r2], 10);
    expect(result.map((r) => r.food.name)).toEqual(['Rice, white, cooked', 'Chicken breast, cooked']);
    expect(result[0].last.id).toBe(r2.id);
    expect(recentFoods([r1, c1, r2], 1)).toHaveLength(1);
  });
});

describe('mealForTime', () => {
  it('picks a meal by time of day', () => {
    expect(mealForTime(7)).toBe('breakfast');
    expect(mealForTime(10, 29)).toBe('breakfast');
    expect(mealForTime(10, 30)).toBe('lunch');
    expect(mealForTime(18)).toBe('dinner');
    expect(mealForTime(22)).toBe('snacks');
    expect(mealForTime(0)).toBe('breakfast');
  });
});
