import type { FoodEntry } from '../entries';
import { entryFromRow, entryToRow, profileFromRow, profileToRow, type Profile } from '../rows';

const entry: FoodEntry = {
  id: '6d1f3c1e-6c3a-4f7e-9a51-2a8f5b0c1d23',
  date: '2026-10-08',
  meal: 'breakfast',
  foodName: 'Banana, raw',
  brand: null,
  source: 'usda',
  sourceId: '2709224',
  quantity: 1,
  unit: 'serving',
  serving: { label: '1 banana', grams: 126 },
  servings: [
    { label: '1 banana', grams: 126 },
    { label: '1 cup', grams: 150 },
  ],
  grams: 126,
  per100g: { calories: 97, protein: 0.74, carbs: 22.71, fat: 0.28 },
  createdAt: '2026-10-08T08:00:00.000Z',
};

const timestamps = { updated_at: '2026-10-08T08:00:00Z', user_id: 'u1' };

describe('entry rows', () => {
  it('round-trips through the row shape', () => {
    const row = { ...entryToRow(entry), ...timestamps } as Parameters<typeof entryFromRow>[0];
    expect(entryFromRow(row)).toEqual(entry);
  });

  it('accepts numeric values serialized as strings', () => {
    const row = { ...entryToRow(entry), ...timestamps, grams: '126' as unknown as number };
    expect(entryFromRow(row as Parameters<typeof entryFromRow>[0])?.grams).toBe(126);
  });

  it('ignores malformed servings', () => {
    const row = { ...entryToRow(entry), ...timestamps, servings: [{ label: 'ok', grams: 10 }, { grams: 5 }, 'x'] };
    expect(entryFromRow(row as Parameters<typeof entryFromRow>[0])?.servings).toEqual([{ label: 'ok', grams: 10 }]);
  });

  it('rejects rows with unknown enums', () => {
    const row = { ...entryToRow(entry), ...timestamps, meal: 'brunch' } as Parameters<typeof entryFromRow>[0];
    expect(entryFromRow(row)).toBeNull();
  });

  it('drops the serving for non-serving units', () => {
    const row = entryToRow({ ...entry, unit: 'g', quantity: 126, serving: null });
    expect(row.serving_grams).toBeNull();
    expect(row.serving_label).toBeNull();
  });
});

describe('profile rows', () => {
  const profile: Profile = {
    unitSystem: 'imperial',
    sex: 'female',
    age: 29,
    heightCm: 165.1,
    weightKg: 61.23,
    activityLevel: 'moderate',
    goal: 'maintain',
    targets: { calories: 2000, protein: 98, carbs: 252, fat: 67 },
  };

  it('round-trips', () => {
    const row = { ...profileToRow('u1', profile), created_at: '', updated_at: '' };
    expect(profileFromRow(row as Parameters<typeof profileFromRow>[0])).toEqual(profile);
  });

  it('treats partial targets as unset', () => {
    const row = { ...profileToRow('u1', profile), target_fat_g: null, created_at: '', updated_at: '' };
    expect(profileFromRow(row as Parameters<typeof profileFromRow>[0]).targets).toBeNull();
  });
});
