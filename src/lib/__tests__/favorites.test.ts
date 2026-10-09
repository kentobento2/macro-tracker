import {
  applyFavoriteOps,
  enqueueFavoriteOp,
  filterFavorites,
  makeFavorite,
  type Favorite,
  type FavoriteOp,
} from '../favorites';
import { foodKey, type FoodItem } from '../foods';

const banana: FoodItem = {
  source: 'usda',
  sourceId: '2709224',
  name: 'Banana, raw',
  brand: null,
  per100g: { calories: 97, protein: 0.74, carbs: 22.71, fat: 0.28 },
  servings: [{ label: '1 banana', grams: 126 }],
  caloriesDerived: false,
};
const noodles: FoodItem = { ...banana, source: 'off', sourceId: '0737628064502', name: 'Peanut noodles', brand: 'Thai Kitchen' };

describe('foodKey', () => {
  it('uses source and id, or the name when there is no id', () => {
    expect(foodKey(banana)).toBe('usda:2709224');
    expect(foodKey({ source: 'custom', sourceId: null, name: '  Mom’s Chili ' })).toBe('name:mom’s chili');
  });
});

describe('makeFavorite', () => {
  it('keeps the serving only for serving units', () => {
    const fav = makeFavorite(banana, { quantity: 1, unit: 'serving', serving: banana.servings[0] }, 't1');
    expect(fav).toEqual({
      key: 'usda:2709224',
      food: banana,
      portion: { quantity: 1, unit: 'serving', serving: { label: '1 banana', grams: 126 } },
      savedAt: 't1',
    });
    expect(makeFavorite(banana, { quantity: 150, unit: 'g', serving: banana.servings[0] }, 't').portion.serving).toBeNull();
  });
  it('rejects empty or incomplete portions', () => {
    expect(() => makeFavorite(banana, { quantity: 0, unit: 'g' }, 't')).toThrow(RangeError);
    expect(() => makeFavorite(banana, { quantity: 1, unit: 'serving' }, 't')).toThrow();
  });
});

describe('favorite queue', () => {
  const a = makeFavorite(banana, { quantity: 1, unit: 'serving', serving: banana.servings[0] }, '2026-10-01T00:00:00Z');
  const b = makeFavorite(noodles, { quantity: 52, unit: 'g' }, '2026-10-05T00:00:00Z');

  it('keeps one pending op per food', () => {
    let q: FavoriteOp[] = enqueueFavoriteOp([], { kind: 'upsert', favorite: a });
    q = enqueueFavoriteOp(q, { kind: 'upsert', favorite: b });
    q = enqueueFavoriteOp(q, { kind: 'delete', key: a.key });
    expect(q).toEqual([{ kind: 'upsert', favorite: b }, { kind: 'delete', key: 'usda:2709224' }]);
  });

  it('applies pending changes over the server list, newest first', () => {
    const updated: Favorite = { ...a, portion: { quantity: 2, unit: 'serving', serving: banana.servings[0] }, savedAt: '2026-10-08T00:00:00Z' };
    expect(applyFavoriteOps([a, b], [{ kind: 'upsert', favorite: updated }]).map((f) => [f.key, f.portion.quantity])).toEqual([
      ['usda:2709224', 2],
      ['off:0737628064502', 52],
    ]);
    expect(applyFavoriteOps([a, b], [{ kind: 'delete', key: b.key }])).toEqual([a]);
  });

  it('filters by name or brand', () => {
    expect(filterFavorites([a, b], 'thai').map((f) => f.key)).toEqual([b.key]);
    expect(filterFavorites([a, b], 'BAN').map((f) => f.key)).toEqual([a.key]);
    expect(filterFavorites([a, b], ' ')).toHaveLength(2);
  });
});
