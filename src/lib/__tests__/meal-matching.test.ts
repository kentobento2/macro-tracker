import type { FoodItem } from '../foods';
import {
  labelAmount,
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

  it('counts "2 eggs" as the standard (large) size when the food has no "egg" serving', () => {
    const egg = food('Egg, whole, raw, fresh', [
      { label: '1 cup (4.86 large eggs)', grams: 243 },
      { label: '1 medium', grams: 44 },
      { label: '1 large', grams: 50 },
    ]);
    const r = ok(resolvePortion(egg, 2, 'eggs'));
    expect(r.grams).toBe(100);
    expect(r.note).toContain('"1 large"');
    // Not for words that aren't the food itself.
    expect(resolvePortion(egg, 2, 'slice').ok).toBe(false);
  });

  it('only allows servings for a food with no known weight', () => {
    const bowl = food('Poke bowl', [{ label: '1 bowl', grams: 100, weightUnknown: true }]);
    expect(ok(resolvePortion(bowl, 2, 'bowls')).portion).toMatchObject({ quantity: 2, unit: 'serving' });
    expect(ok(resolvePortion(bowl, 1, 'serving')).portion.quantity).toBe(1);
    for (const unit of ['g', 'oz', 'ml']) {
      const r = resolvePortion(bowl, 200, unit);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/no known weight.*"1 bowl"/);
    }
  });

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

  it('marks a match as covered only when every word the user said is in it', () => {
    expect(scoreMatch('banana', banana).covered).toBe(true);
    expect(scoreMatch('chicken breast', food('Chicken breast, grilled')).covered).toBe(true);
    expect(scoreMatch('loco moco', food('Moco Chocolate Bar')).covered).toBe(false);
  });

  it('uses brand words too', () => {
    const quest = scoreMatch('quest bar', food('Protein Bar, Cookies & Cream', [], 'Quest'));
    expect(quest.covered).toBe(true);
  });

  it('does not count descriptors like "whole, raw, fresh" against a food', () => {
    const ranked = rankFoods('egg', [food('Egg, Benedict'), food('Egg, creamed'), food('Egg, whole, raw, fresh')]);
    expect(ranked[0].food.name).toBe('Egg, whole, raw, fresh');
    expect(ranked[0].score).toBe(1);
  });

  it('prefers generic foods over brands the user did not name', () => {
    const generic = food('Chicken breast, baked, broiled, or roasted, skin not eaten, from raw');
    const tyson = food('Chicken Breast', [], 'Tyson');
    expect(rankFoods('chicken breast', [tyson, generic])[0].food).toBe(generic);
    // …but a brand the user did name wins.
    expect(rankFoods('tyson chicken breast', [generic, tyson])[0].food).toBe(tyson);
  });

  it('rewards the preparation the user said', () => {
    const grilled = food('Chicken breast, grilled without sauce, skin not eaten');
    const fried = food('Chicken breast, fried, coated, skin eaten');
    const tyson = food('Chicken Breast', [], 'Tyson');
    expect(rankFoods('chicken breast', [tyson, fried, grilled], 'grilled')[0].food).toBe(grilled);
  });

  // Real USDA names seen in production for "2 eggs, 1 cup cooked white rice, 6 oz grilled chicken breast".
  it('picks sensible defaults among real USDA results', () => {
    const eggs = [
      food('Eggs', [], 'Oakdell Egg'), // brand containing the food word is not "naming" the brand
      food('Eggs, Grade A, Large, egg whole'),
      food('Egg, Benedict'),
    ];
    expect(rankFoods('egg', eggs)[0].food.name).toBe('Eggs, Grade A, Large, egg whole');

    const rice = [
      food('Rice, white, cooked, glutinous'),
      food('Rice, white, cooked, NS as to fat'),
      food('Rice, white, cooked, as ingredient'),
    ];
    expect(rankFoods('white rice', rice, 'cooked')[0].food.name).not.toBe('Rice, white, cooked, glutinous');

    const chicken = [
      food('Chicken, breast, meat and skin, raw'),
      food('Chicken breast, grilled without sauce, skin eaten'),
      food('Chicken breast, grilled with sauce, skin eaten'),
      food('Chicken breast, grilled without sauce, skin not eaten'),
    ];
    expect(rankFoods('chicken breast', chicken, 'grilled')[0].food.name).toBe(
      'Chicken breast, grilled without sauce, skin not eaten'
    );
  });

  it('ranks covered matches first, then by score, keeping relevance order on ties', () => {
    const ranked = rankFoods('banana bread', [banana, food('Bread, banana'), food('Bread')]);
    expect(ranked[0].food.name).toBe('Bread, banana');
    const ties = rankFoods('banana', [food('Banana, fresh'), food('Banana, raw')]);
    expect(ties.map((r) => r.food.name)).toEqual(['Banana, fresh', 'Banana, raw']);
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
