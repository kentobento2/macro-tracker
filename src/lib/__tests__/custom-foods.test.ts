import {
  applyCustomFoodOps,
  customFoodCalories,
  customFoodInputFromForm,
  customFoodToItem,
  enqueueCustomFoodOp,
  filterCustomFoods,
  findCustomFoodByName,
  normalizeServingLabel,
  validateCustomFood,
  type CustomFood,
} from '../custom-foods';
import { buildEntry, entryNutrition } from '../entries';
import { foodKey } from '../foods';
import { formatPortion } from '../format';
import { customFoodFromRow, customFoodToRow, entryFromRow, entryToRow } from '../rows';
import { hasKnownWeight } from '../units';

const bar: CustomFood = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Homemade protein bar',
  brand: null,
  servingLabel: '1 bar',
  servingGrams: 60,
  calories: 240,
  protein: 20,
  carbs: 24,
  fat: 8,
  updatedAt: '2026-10-09T00:00:00.000Z',
};
const bowl: CustomFood = {
  ...bar,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Poke bowl',
  brand: 'Ono Seafood',
  servingLabel: '1 bowl',
  servingGrams: null,
  calories: null,
  protein: 40,
  carbs: 70,
  fat: 15,
};

describe('validateCustomFood', () => {
  it('accepts label-style nutrition and tidies text', () => {
    const r = validateCustomFood({ name: '  Poke  bowl ', brand: ' ', servingLabel: 'bowl', protein: 40, carbs: 70, fat: 15 });
    expect(r).toEqual({
      ok: true,
      value: { name: 'Poke bowl', brand: null, servingLabel: '1 bowl', servingGrams: null, calories: null, protein: 40, carbs: 70, fat: 15 },
    });
  });

  it('requires a name and sane numbers', () => {
    const r = validateCustomFood({ name: '', protein: -1, carbs: 2000, fat: 1, calories: 20000, servingGrams: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['calories', 'carbs', 'name', 'protein', 'servingGrams']);
  });

  it('rejects numbers that are impossible for the serving weight', () => {
    const tooMuchMacro = validateCustomFood({ name: 'x', servingGrams: 30, protein: 20, carbs: 20, fat: 5 });
    expect(!tooMuchMacro.ok && tooMuchMacro.errors.servingGrams).toMatch(/more than 30 g/);
    const tooManyKcal = validateCustomFood({ name: 'x', servingGrams: 10, calories: 500, protein: 1, carbs: 1, fat: 1 });
    expect(!tooManyKcal.ok && tooManyKcal.errors.calories).toMatch(/more calories/);
  });

  it('allows all-zero foods (water, black coffee)', () => {
    expect(validateCustomFood({ name: 'Black coffee', servingLabel: '1 cup', servingGrams: 240, calories: 0, protein: 0, carbs: 0, fat: 0 }).ok).toBe(true);
  });
});

describe('form parsing', () => {
  it('treats blank optional fields as unknown and blank macros as 0', () => {
    const { input, errors } = customFoodInputFromForm({
      name: 'Bowl', brand: '', servingLabel: '', servingGrams: '', calories: '', protein: '40', carbs: '', fat: '15,5',
    });
    expect(errors).toEqual({});
    expect(input).toMatchObject({ servingGrams: null, calories: null, protein: 40, carbs: 0, fat: 15.5 });
  });

  it('flags non-numbers', () => {
    expect(customFoodInputFromForm({ name: 'x', brand: '', servingLabel: '', servingGrams: 'abc', calories: '1e5', protein: '1', carbs: '1', fat: '1' }).errors)
      .toEqual({ servingGrams: 'Enter a number.', calories: 'Enter a number.' });
  });
});

describe('serving labels', () => {
  it('adds an amount when missing', () => {
    expect(normalizeServingLabel('bar')).toBe('1 bar');
    expect(normalizeServingLabel('2 slices')).toBe('2 slices');
    expect(normalizeServingLabel('')).toBe('1 serving');
  });
});

describe('customFoodToItem', () => {
  it('converts per-serving values to per 100 g when the weight is known', () => {
    const item = customFoodToItem(bar);
    expect(item).toMatchObject({ source: 'custom', sourceId: bar.id, caloriesDerived: false, servings: [{ label: '1 bar', grams: 60 }] });
    expect(item.per100g.calories).toBeCloseTo(400);
    expect(item.per100g.protein).toBeCloseTo(33.33, 2);
    expect(hasKnownWeight(item)).toBe(true);
    expect(foodKey(item)).toBe(`custom:${bar.id}`);
  });

  it('logs exactly the entered numbers per serving, even without a weight', () => {
    const item = customFoodToItem(bowl);
    expect(hasKnownWeight(item)).toBe(false);
    expect(item.caloriesDerived).toBe(true);
    const entry = buildEntry({
      id: 'e1', date: '2026-10-09', meal: 'lunch', food: item,
      portion: { quantity: 1.5, unit: 'serving', serving: item.servings[0] }, createdAt: '2026-10-09T00:00:00Z',
    });
    const n = entryNutrition(entry);
    expect(n.protein).toBeCloseTo(60);
    expect(n.calories).toBeCloseTo(1.5 * customFoodCalories(bowl)); // 4/4/9 from the macros
    expect(customFoodCalories(bowl)).toBe(40 * 4 + 70 * 4 + 15 * 9);
    expect(formatPortion(entry)).toBe('1.5 × 1 bowl'); // no made-up grams
  });

  it('keeps the weight-unknown flag through an entry row round trip', () => {
    const item = customFoodToItem(bowl);
    const entry = buildEntry({
      id: '33333333-3333-4333-8333-333333333333', date: '2026-10-09', meal: 'lunch', food: item,
      portion: { quantity: 1, unit: 'serving', serving: item.servings[0] }, createdAt: '2026-10-09T00:00:00Z',
    });
    const row = { ...entryToRow(entry), user_id: 'u', updated_at: entry.createdAt } as Parameters<typeof entryFromRow>[0];
    const back = entryFromRow(row)!;
    expect(back.serving?.weightUnknown).toBe(true);
    expect(back.servings[0].weightUnknown).toBe(true);
    expect(formatPortion(back)).toBe('1 bowl');
  });
});

describe('custom food rows', () => {
  it('round-trips', () => {
    const row = { ...customFoodToRow('u', bowl), created_at: bowl.updatedAt, updated_at: bowl.updatedAt } as Parameters<typeof customFoodFromRow>[0];
    expect(customFoodFromRow(row)).toEqual(bowl);
  });
});

describe('custom food queue and search', () => {
  it('keeps the last op per food and sorts by name', () => {
    let q = enqueueCustomFoodOp([], { kind: 'upsert', food: bowl });
    q = enqueueCustomFoodOp(q, { kind: 'upsert', food: { ...bowl, protein: 45 } });
    expect(q).toHaveLength(1);
    expect(applyCustomFoodOps([bar], q).map((f) => f.name)).toEqual(['Homemade protein bar', 'Poke bowl']);
    expect(applyCustomFoodOps([bar, bowl], [{ kind: 'delete', id: bar.id }]).map((f) => f.name)).toEqual(['Poke bowl']);
  });

  it('filters by name or brand and finds by exact name', () => {
    expect(filterCustomFoods([bar, bowl], 'ono').map((f) => f.name)).toEqual(['Poke bowl']);
    expect(findCustomFoodByName([bar, bowl], '  POKE bowl ')?.id).toBe(bowl.id);
    expect(findCustomFoodByName([bar, bowl], 'poke')).toBeUndefined();
  });
});
