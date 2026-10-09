import type { FoodItem } from '../foods';
import {
  labelAmount,
  MIN_MATCH_SCORE,
  nameTokens,
  rankFoods,
  resolvePortion,
  scoreMatch,
} from '../meal-matching';
import { dateKeyInTimeZone, isValidTimeZone } from '../tz';

const food = (name: string, servings: FoodItem['servings'] = [], brand: string | null = null): FoodItem => ({
  source: 'usda',
  sourceId: '1',
  name,
  brand,
  per100g: { calories: 100, protein: 10, carbs: 10, fat: 2 },
  servings,
  caloriesDerived: false,
});

const banana = food('Banana, raw', [
  { label: '1 banana', grams: 126 },
  { label: '1 cup', grams: 150 },
]);
const rice = food('Rice, white, cooked', [{ label: '1/2 cup (79 g)', grams: 79 }]);

describe('labelAmount', () => {
  it('reads leading amounts and fractions', () => {
    expect(labelAmount('1 cup')).toBe(1);
    expect(labelAmount('1/2 cup (79 g)')).toBe(0.5);
    expect(labelAmount('1 1/2 cups')).toBe(1.5);
    expect(labelAmount('2.5 oz')).toBe(2.5);
    expect(labelAmount('cup')).toBe(1);
  });
});

describe('resolvePortion', () => {
  const ok = (r: ReturnType<typeof resolvePortion>) => {
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('converts mass units', () => {
    expect(ok(resolvePortion(banana, 150, 'g')).grams).toBe(150);
    expect(ok(resolvePortion(banana, 0.5, 'lb')).grams).toBeCloseTo(226.8);
    expect(ok(resolvePortion(banana, 4, 'oz'))).toMatchObject({ portion: { quantity: 4, unit: 'oz' } });
    expect(ok(resolvePortion(banana, 4, 'oz')).grams).toBeCloseTo(113.4);
  });

  it('converts volume with a note', () => {
    const v = ok(resolvePortion(banana, 250, 'ml'));
    expect(v.grams).toBe(250);
    expect(v.note).toMatch(/1 ml/);
  });

  it('matches household units and food words to servings', () => {
    expect(ok(resolvePortion(banana, 2, 'bananas'))).toMatchObject({ grams: 252, portion: { unit: 'serving', quantity: 2 } });
    expect(ok(resolvePortion(banana, 1, 'cup')).grams).toBe(150);
    expect(ok(resolvePortion(banana, 1, 'serving')).grams).toBe(126);
  });

  it('scales by the amount in the serving label', () => {
    // Serving is 1/2 cup = 79 g, so 1 cup = 2 servings = 158 g.
    const v = ok(resolvePortion(rice, 1, 'cups'));
    expect(v.portion.quantity).toBe(2);
    expect(v.grams).toBe(158);
  });

  it('explains when a household unit is unavailable', () => {
    const r = resolvePortion(banana, 1, 'slice');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/"1 banana", "1 cup".*grams or ounces/);
  });

  it('rejects zero, negative, non-finite and absurd quantities', () => {
    for (const q of [0, -1, NaN, Infinity]) expect(resolvePortion(banana, q, 'g').ok).toBe(false);
    expect(resolvePortion(banana, 5, 'kg').ok).toBe(false); // > 3 kg
    expect(resolvePortion(banana, 60, 'serving').ok).toBe(false); // > 50 servings
    expect(resolvePortion(banana, 2, 'kg').ok).toBe(true);
  });
});

describe('name matching', () => {
  it('tokenizes, singularizes and drops filler words', () => {
    expect(nameTokens('Two eggs with the toast (buttered)')).toEqual(['two', 'egg', 'toast']);
  });

  it('prefers foods covering every word the user said', () => {
    expect(scoreMatch('banana', banana)).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
    expect(scoreMatch('chicken breast', food('Chicken breast, grilled'))).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
    expect(scoreMatch('loco moco', food('Moco Chocolate Bar'))).toBeLessThan(MIN_MATCH_SCORE);
  });

  it('uses brand words too', () => {
    expect(scoreMatch('quest bar', food('Protein Bar, Cookies & Cream', [], 'Quest'))).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
  });

  it('gives preparation a small tie-breaking bonus', () => {
    const grilled = scoreMatch('chicken breast', food('Chicken breast, grilled'), 'grilled');
    const fried = scoreMatch('chicken breast', food('Chicken breast, fried'), 'grilled');
    expect(grilled).toBeGreaterThan(fried);
  });

  it('ranks best first and keeps relevance order on ties', () => {
    const ranked = rankFoods('banana', [food('Banana chips'), food('Bread'), banana]);
    expect(ranked[0].food.name).toBe('Banana chips'); // tie with "Banana, raw" keeps earlier one
    expect(ranked.map((r) => r.food.name).at(-1)).toBe('Bread');
  });
});

describe('timezones', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone('Pacific/Honolulu')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('computes the local date for a timezone', () => {
    const now = new Date('2026-10-09T08:30:00Z'); // 22:30 on Oct 8 in Honolulu (UTC-10)
    expect(dateKeyInTimeZone(now, 'Pacific/Honolulu')).toBe('2026-10-08');
    expect(dateKeyInTimeZone(now, 'Asia/Tokyo')).toBe('2026-10-09');
    expect(dateKeyInTimeZone(now, 'not/a-zone')).toBe('2026-10-08'); // falls back to Honolulu
  });
});
