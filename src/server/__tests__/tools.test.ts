import { z } from 'zod';

import { buildEntry } from '../../lib/entries';
import { makeFavorite } from '../../lib/favorites';
import { foodKey, normalizeUsdaFood, type FoodItem } from '../../lib/foods';
import type { FoodLookup } from '../foods';
import { createUserStore, type Db } from '../store';
import { createFakeDb, fakeClient, type FakeDb } from '../testing/fake-supabase';
import { TOOLS, type ToolContext } from '../tools';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// 22:30 on Oct 8 in Honolulu (UTC-10); already Oct 9 in UTC.
const NOW = new Date('2026-10-09T08:30:00Z');
const TODAY = '2026-10-08';

// Catalog built from real USDA records (trimmed as the server does).
const usda = (fdcId: number, description: string, kcal: number, p: number, c: number, f: number, measures: [string, number][] = [], extra = {}) =>
  normalizeUsdaFood({
    fdcId,
    description,
    foodNutrients: [
      { nutrientId: 1008, unitName: 'KCAL', value: kcal },
      { nutrientId: 1003, unitName: 'G', value: p },
      { nutrientId: 1005, unitName: 'G', value: c },
      { nutrientId: 1004, unitName: 'G', value: f },
    ],
    foodMeasures: measures.map(([disseminationText, gramWeight]) => ({ disseminationText, gramWeight })),
    ...extra,
  })!;
const banana = usda(2709224, 'Banana, raw', 97, 0.74, 22.71, 0.28, [['1 banana', 126], ['1 cup', 150]]);
const rice = usda(169756, 'Rice, white, cooked', 130, 2.7, 28, 0.3, [['1/2 cup', 79]]);
const egg = usda(748967, 'Egg, whole, cooked, hard-boiled', 155, 12.6, 1.12, 10.6, [['1 large', 50], ['1 egg', 50]]);
const yogurt = usda(2756285, 'Chobani Yogurt, Greek, Blended, Coffee', 93.3, 7.33, 12, 1.67, [], {
  brandName: 'Chobani',
  servingSize: 150,
  servingSizeUnit: 'g',
});
const chicken: FoodItem = { ...usda(171477, 'Chicken breast, grilled', 165, 31, 0, 3.6), servings: [{ label: '1 breast', grams: 172 }] };

function fakeFoods(): FoodLookup & { calls: string[] } {
  const catalog = [banana, rice, egg, yogurt, chicken];
  const calls: string[] = [];
  return {
    calls,
    async searchExternal(q) {
      calls.push(`usda:${q}`);
      return { usda: catalog, off: [], problems: [] };
    },
    async searchOff(q) {
      calls.push(`off:${q}`);
      return { foods: [] };
    },
    async fetchByRef(ref) {
      calls.push(`ref:${ref}`);
      return catalog.find((f) => foodKey(f) === ref) ?? null;
    },
  };
}

let db: FakeDb;
let foods: ReturnType<typeof fakeFoods>;
let uuid = 0;
const ctxFor = (userId: string): ToolContext => ({
  store: createUserStore(fakeClient(db) as unknown as Db, userId),
  foods,
  now: NOW,
  newId: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
});

/** Validate args with the tool's real schema (as the MCP SDK does), then run it. */
async function call(name: string, args: Record<string, unknown>, userId = A) {
  const tool = TOOLS.find((t) => t.name === name)!;
  const parsed = z.object(tool.inputSchema).parse(args);
  return tool.run(parsed as never, ctxFor(userId));
}
const data = (r: Awaited<ReturnType<typeof call>>) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.data as any;
};
const schemaRejects = (name: string, args: Record<string, unknown>) =>
  !z.object(TOOLS.find((t) => t.name === name)!.inputSchema).safeParse(args).success;

beforeEach(async () => {
  db = createFakeDb({
    tables: {
      profiles: [
        { id: A, unit_system: 'imperial', timezone: 'Pacific/Honolulu', target_calories: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 67 },
        { id: B, unit_system: 'metric', timezone: 'Pacific/Honolulu', target_calories: 1800, target_protein_g: 110, target_carbs_g: 200, target_fat_g: 60 },
      ],
      favorite_foods: [],
    },
  });
  foods = fakeFoods();
  // A has a favorite chicken breast; B has their own entries and weigh-ins.
  db.tables.favorite_foods.push({
    user_id: A,
    ...favoriteRow(makeFavorite(chicken, { quantity: 1, unit: 'serving', serving: chicken.servings[0] }, '2026-10-01T00:00:00Z')),
  });
  await createUserStore(fakeClient(db) as unknown as Db, B).insertEntries([
    buildEntry({ id: 'b0000000-0000-4000-8000-000000000001', date: TODAY, meal: 'lunch', food: rice, portion: { quantity: 300, unit: 'g' }, createdAt: '2026-10-08T22:00:00Z' }),
  ]);
  await createUserStore(fakeClient(db) as unknown as Db, B).saveWeight({ date: TODAY, weightKg: 60, note: null });
});

function favoriteRow(f: ReturnType<typeof makeFavorite>) {
  // Same mapping the server reads back (rows.ts), without user_id.
  const { favoriteToRow } = jest.requireActual('../../lib/rows') as typeof import('../../lib/rows');
  const { user_id: _u, ...row } = favoriteToRow('x', f);
  return { ...row, created_at: f.savedAt };
}

const BS_ENTRY = 'b0000000-0000-4000-8000-000000000001';

describe('preview_meal', () => {
  it('matches, scales, totals, and saves nothing', async () => {
    const r = data(
      await call('preview_meal', {
        items: [
          { food_name: 'banana', quantity: 2, unit: 'bananas' },
          { food_name: 'white rice', quantity: 1, unit: 'cup', preparation: 'cooked' },
        ],
      })
    );
    expect(r.saved).toBe(false);
    expect(r.items[0]).toMatchObject({ status: 'matched', food_ref: 'usda:2709224', source: 'usda', grams: 252, calories: 244 });
    expect(r.items[1]).toMatchObject({ status: 'matched', food_ref: 'usda:169756', grams: 158, calories: 205 });
    expect(r.total_of_matched_items.calories).toBe(449);
    expect(db.tables.food_entries.filter((e) => e.user_id === A)).toHaveLength(0);
  });

  it("uses the user's saved foods first without calling external databases", async () => {
    const r = data(await call('preview_meal', { items: [{ food_name: 'chicken breast', quantity: 1, unit: 'breast' }] }));
    expect(r.items[0]).toMatchObject({ status: 'matched', source: 'saved', grams: 172 });
    expect(foods.calls.filter((c) => c.startsWith('usda:'))).toEqual([]);
  });

  it('returns a clear not_found message instead of guessing', async () => {
    const r = data(await call('preview_meal', { items: [{ food_name: 'loco moco', quantity: 1, unit: 'plate' }] }));
    expect(r.items[0].status).toBe('not_found');
    expect(r.items[0].message).toMatch(/No confident match for "loco moco".*approximate breakdown/);
    expect(foods.calls).toContain('off:loco moco'); // tried Open Food Facts last
  });

  it('asks for a usable unit when the food has no such serving', async () => {
    const r = data(await call('preview_meal', { items: [{ food_name: 'banana', quantity: 1, unit: 'slice' }] }));
    expect(r.items[0]).toMatchObject({ status: 'needs_unit' });
    expect(r.items[0].message).toMatch(/"1 banana", "1 cup"/);
  });

  it('among equally good matches, picks one that has the unit the user said', async () => {
    const noServings = usda(2710788, 'Rice, white, cooked, as ingredient', 130, 2.5, 29, 0.4);
    const withCup = usda(2708403, 'Rice, white, cooked, NS as to fat', 130, 2.5, 29, 0.4, [['1 cup', 158]]);
    const catalog = [noServings, withCup];
    foods.searchExternal = async () => ({ usda: catalog, off: [], problems: [] });
    foods.fetchByRef = async (ref) => catalog.find((f) => foodKey(f) === ref) ?? null;
    const r = data(await call('preview_meal', { items: [{ food_name: 'white rice', quantity: 1, unit: 'cup', preparation: 'cooked' }] }));
    expect(r.items[0]).toMatchObject({ status: 'matched', food_ref: 'usda:2708403', grams: 158 });
  });

  it('rejects zero, negative and absurd quantities', async () => {
    expect(schemaRejects('preview_meal', { items: [{ food_name: 'banana', quantity: 0, unit: 'g' }] })).toBe(true);
    expect(schemaRejects('preview_meal', { items: [{ food_name: 'banana', quantity: -2, unit: 'g' }] })).toBe(true);
    expect(schemaRejects('preview_meal', { items: [] })).toBe(true);
    const r = data(await call('preview_meal', { items: [{ food_name: 'banana', quantity: 20, unit: 'kg' }] }));
    expect(r.items[0].status).toBe('needs_unit');
    expect(r.items[0].message).toMatch(/more than 3 kg/);
  });
});

describe('log_meal', () => {
  it("saves to today in the user's timezone and returns updated totals", async () => {
    const r = data(
      await call('log_meal', {
        items: [
          { food_ref: 'usda:2709224', quantity: 1, unit: 'banana' },
          { food_ref: 'usda:748967', quantity: 2, unit: 'eggs' },
        ],
        meal: 'breakfast',
      })
    );
    expect(r.saved).toHaveLength(2);
    expect(r.saved[0]).toMatchObject({ date: TODAY, meal: 'breakfast', food: 'Banana, raw', grams: 126, calories: 122 });
    expect(r.daily_summary.consumed.calories).toBe(122 + 155);
    expect(r.daily_summary.remaining.calories).toBe(2000 - 277);
    const mine = db.tables.food_entries.filter((e) => e.user_id === A);
    expect(mine).toHaveLength(2);
    // B's day is untouched.
    expect(db.tables.food_entries.filter((e) => e.user_id === B)).toHaveLength(1);
  });

  it('maps "snack" to the app\'s snacks meal and accepts past dates', async () => {
    const r = data(await call('log_meal', { items: [{ food_ref: 'usda:169756', quantity: 100, unit: 'g' }], meal: 'snack', date: '2026-10-01' }));
    expect(r.saved[0]).toMatchObject({ meal: 'snack', date: '2026-10-01' });
    expect(db.tables.food_entries.find((e) => e.user_id === A)!.meal).toBe('snacks');
  });

  it('saves nothing if any item is bad', async () => {
    const r = await call('log_meal', {
      items: [
        { food_ref: 'usda:2709224', quantity: 1, unit: 'banana' },
        { food_ref: 'usda:999999', quantity: 1, unit: 'g' },
      ],
      meal: 'lunch',
    });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/Item 2.*not found.*Nothing was saved/);
    expect(db.tables.food_entries.filter((e) => e.user_id === A)).toHaveLength(0);
  });

  it('rejects future dates', async () => {
    const r = await call('log_meal', { items: [{ food_ref: 'usda:2709224', quantity: 1, unit: 'g' }], meal: 'lunch', date: '2026-10-09' });
    expect(r.ok).toBe(false);
  });
});

describe('search_foods and get_recent_foods', () => {
  it('lists saved matches before external ones', async () => {
    const r = data(await call('search_foods', { query: 'chicken breast' }));
    expect(r.saved[0]).toMatchObject({ food_ref: 'usda:171477', source: 'saved' });
    expect(r.usda.length).toBeGreaterThan(0);
  });

  it('returns favorites, recent foods and recent meals in a loggable form', async () => {
    await call('log_meal', { items: [{ food_ref: 'usda:2709224', quantity: 1, unit: 'banana' }], meal: 'breakfast', date: '2026-10-07' });
    const r = data(await call('get_recent_foods', {}));
    expect(r.today).toBe(TODAY);
    expect(r.favorites[0]).toMatchObject({ food_ref: 'usda:171477', usual_portion: { quantity: 172, unit: 'g' } });
    expect(r.recent_foods[0]).toMatchObject({ food_ref: 'usda:2709224', quantity: 126, unit: 'g' });
    expect(r.meals_last_7_days[0]).toMatchObject({ date: '2026-10-07', meal: 'breakfast' });
    // Nothing of B's.
    expect(JSON.stringify(r)).not.toContain('Rice');
  });
});

describe('get_daily_summary', () => {
  it("shows only the user's own entries, with ids and remaining", async () => {
    await call('log_meal', { items: [{ food_ref: 'usda:2709224', quantity: 1, unit: 'banana' }], meal: 'lunch' });
    const r = data(await call('get_daily_summary', {}));
    expect(r.date).toBe(TODAY);
    expect(r.meals.lunch.entries).toHaveLength(1);
    expect(r.meals.lunch.entries[0].food).toBe('Banana, raw');
    expect(r.meals.lunch.entries[0].entry_id).toMatch(/^00000000-/);
    expect(r.consumed.calories).toBe(122);
    expect(r.remaining.protein_g).toBeCloseTo(150 - 0.9, 1);
  });
});

describe('update_log_entry', () => {
  it('changes quantity keeping the serving, or switches unit/food/meal', async () => {
    const saved = data(await call('log_meal', { items: [{ food_ref: 'usda:2709224', quantity: 1, unit: 'banana' }], meal: 'lunch' })).saved[0];
    const twice = data(await call('update_log_entry', { entry_id: saved.entry_id, quantity: 2 }));
    expect(twice.after).toMatchObject({ grams: 252, calories: 244 });
    const grams = data(await call('update_log_entry', { entry_id: saved.entry_id, quantity: 100, unit: 'g' }));
    expect(grams.after).toMatchObject({ grams: 100, calories: 97 });
    const moved = data(await call('update_log_entry', { entry_id: saved.entry_id, meal: 'dinner' }));
    expect(moved.after).toMatchObject({ meal: 'dinner', grams: 100 });
    const swapped = data(await call('update_log_entry', { entry_id: saved.entry_id, food_ref: 'usda:169756' }));
    expect(swapped.after).toMatchObject({ food: 'Rice, white, cooked', grams: 100, calories: 130 });
  });

  it('requires something to change', async () => {
    const r = await call('update_log_entry', { entry_id: BS_ENTRY });
    expect(r.ok).toBe(false);
  });
});

describe('delete_log_entry', () => {
  it("deletes the user's own entry", async () => {
    const saved = data(await call('log_meal', { items: [{ food_ref: 'usda:2709224', quantity: 1, unit: 'banana' }], meal: 'lunch' })).saved[0];
    const r = data(await call('delete_log_entry', { entry_id: saved.entry_id }));
    expect(r.deleted.food).toBe('Banana, raw');
    expect(r.daily_summary.consumed.calories).toBe(0);
  });
});

describe('isolation between users', () => {
  it("user A cannot read user B's entries", async () => {
    const a = data(await call('get_daily_summary', {}, A));
    expect(a.consumed.calories).toBe(0);
    const b = data(await call('get_daily_summary', {}, B));
    expect(b.consumed.calories).toBe(390); // B's 300 g of rice
    expect(await ctxFor(A).store.getEntry(BS_ENTRY)).toBeNull();
  });

  it("user A cannot update user B's entry", async () => {
    const r = await call('update_log_entry', { entry_id: BS_ENTRY, quantity: 1, unit: 'g' }, A);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/No entry with id/);
    const bRow = db.tables.food_entries.find((e) => e.id === BS_ENTRY)!;
    expect(bRow).toMatchObject({ user_id: B, grams: 300 });
    // Even calling the store directly with B's entry can't change it.
    const forged = { ...(await ctxFor(B).store.getEntry(BS_ENTRY))!, grams: 1 };
    expect(await ctxFor(A).store.replaceEntry(forged)).toBe(false);
    expect(db.tables.food_entries.find((e) => e.id === BS_ENTRY)!.grams).toBe(300);
  });

  it("user A cannot delete user B's entry", async () => {
    const r = await call('delete_log_entry', { entry_id: BS_ENTRY }, A);
    expect(r).toMatchObject({ ok: false });
    expect(await ctxFor(A).store.deleteEntry(BS_ENTRY)).toBe(false);
    expect(db.tables.food_entries.some((e) => e.id === BS_ENTRY)).toBe(true);
  });

  it("user A's weight tools never see or overwrite B's weigh-ins", async () => {
    const trend = data(await call('get_weight_trend', {}, A));
    expect(trend.entries).toEqual([]);
    await call('log_weight', { weight: 180, unit: 'lb' }, A);
    const rows = db.tables.body_weights.filter((w) => w.entry_date === TODAY);
    expect(rows.map((w) => w.user_id).sort()).toEqual([A, B].sort());
    expect(rows.find((w) => w.user_id === B)!.weight_kg).toBe(60);
  });

  it('no tool accepts a user id', () => {
    for (const t of TOOLS) {
      expect(Object.keys(t.inputSchema).filter((k) => /user/i.test(k))).toEqual([]);
    }
  });
});

describe('log_weight and get_weight_trend', () => {
  it('converts lb, replaces the same day, and rejects implausible weights', async () => {
    const first = data(await call('log_weight', { weight: 180.4, unit: 'lb' }));
    expect(first.saved).toMatchObject({ date: TODAY, weight: 180.4, unit: 'lb', replaced_existing_weigh_in_for_that_day: false });
    const again = data(await call('log_weight', { weight: 180, unit: 'lb', note: 'after run' }));
    expect(again.saved.replaced_existing_weigh_in_for_that_day).toBe(true);
    expect(db.tables.body_weights.filter((w) => w.user_id === A)).toHaveLength(1);
    const bad = await call('log_weight', { weight: 5, unit: 'lb' });
    expect(bad).toMatchObject({ ok: false });
  });

  it('returns entries, weekly averages and the week-over-week change', async () => {
    for (const [date, lb] of [['2026-09-29', 182], ['2026-10-01', 181], ['2026-10-06', 180], ['2026-10-08', 179]] as const) {
      await call('log_weight', { weight: lb, unit: 'lb', date });
    }
    const r = data(await call('get_weight_trend', { days: 14 }));
    expect(r.unit).toBe('lb');
    expect(r.entries.map((e: any) => e.weight)).toEqual([182, 181, 180, 179]);
    expect(r.weekly_averages).toEqual([
      { week_starting: '2026-10-05', average: 179.5, weigh_ins: 2 },
      { week_starting: '2026-09-28', average: 181.5, weigh_ins: 2 },
    ]);
    expect(r.change_vs_previous_week).toBe(-2);
  });

  it('defaults to 30 days and validates the range', () => {
    expect(z.object(TOOLS.find((t) => t.name === 'get_weight_trend')!.inputSchema).parse({})).toEqual({ days: 30 });
    expect(schemaRejects('get_weight_trend', { days: 0 })).toBe(true);
    expect(schemaRejects('get_weight_trend', { days: 5000 })).toBe(true);
  });
});

describe('tool metadata', () => {
  it('marks read-only and destructive tools', () => {
    const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t.annotations]));
    for (const n of ['preview_meal', 'search_foods', 'get_recent_foods', 'get_daily_summary', 'get_weight_trend']) {
      expect(byName[n].readOnlyHint).toBe(true);
    }
    expect(byName.delete_log_entry).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.log_meal.readOnlyHint).toBe(false);
  });

  it('tells the assistant to preview and confirm', () => {
    const desc = Object.fromEntries(TOOLS.map((t) => [t.name, t.description]));
    expect(desc.preview_meal).toMatch(/WITHOUT saving/);
    expect(desc.preview_meal).toMatch(/confirm/);
    expect(desc.delete_log_entry).toMatch(/ALWAYS confirm/);
  });
});

describe('upstream outages', () => {
  it('log_meal says the database was unreachable (not "not found") and saves nothing', async () => {
    foods.fetchByRef = async () => {
      throw new Error('USDA down');
    };
    const r = await call('log_meal', { items: [{ food_ref: 'usda:2709224', quantity: 1, unit: 'banana' }], meal: 'lunch' });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/couldn't be reached.*Nothing was saved/);
    expect(db.tables.food_entries.filter((e) => e.user_id === A)).toHaveLength(0);
  });
});
