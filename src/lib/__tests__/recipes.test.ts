import { buildEntry, entryNutrition, foodFromEntry } from '../entries';
import { foodKey, type FoodItem } from '../foods';
import { formatPortion } from '../format';
import {
  applyRecipeOps,
  batchShare,
  enqueueRecipeOp,
  filterRecipes,
  findRecipeByName,
  makeIngredient,
  portionIngredients,
  recipePerServing,
  recipeToItem,
  recipeTotals,
  validateRecipe,
  type Recipe,
} from '../recipes';
import { entryFromRow, entryToRow, parseRecipeSnapshot, recipeFromRow, recipeToRow } from '../rows';
import { GRAMS_PER_OUNCE, hasKnownWeight } from '../units';

const food = (name: string, per100g: FoodItem['per100g'], servings: FoodItem['servings'] = []): FoodItem => ({
  source: 'usda',
  sourceId: name.length.toString(),
  name,
  brand: null,
  per100g,
  servings,
  caloriesDerived: false,
});

// Per-100 g values chosen to reproduce the sausage pasta batch from USDA (2,537 kcal).
const sausage = food('Italian sausage', { calories: 317, protein: 18.2, carbs: 2.16, fat: 26.2 });
const pasta = food('Pasta, dry, enriched', { calories: 371, protein: 13.04, carbs: 74.67, fat: 1.51 });
const tomatoes = food('Tomatoes, crushed, canned', { calories: 32, protein: 1.64, carbs: 7.3, fat: 0.28 });
const cream = food('Cream, heavy', { calories: 343, protein: 2.02, carbs: 3.8, fat: 35.56 }, [{ label: '1 cup', grams: 240 }]);
const parm = food('Cheese, parmesan, grated', { calories: 420, protein: 28.42, carbs: 13.91, fat: 27.84 });

const oz = (n: number) => ({ quantity: n, unit: 'oz' as const });
const ingredients = [
  makeIngredient(sausage, oz(8)),
  makeIngredient(pasta, oz(8)),
  makeIngredient(tomatoes, oz(16)),
  makeIngredient(cream, { quantity: 0.5, unit: 'serving', serving: cream.servings[0] }),
  makeIngredient(parm, { quantity: 100, unit: 'g' }),
];
const pastaRecipe: Recipe = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Sausage pasta',
  ingredients,
  servings: 4,
  cookedGrams: 1450,
  updatedAt: '2026-10-09T00:00:00.000Z',
};

describe('recipe totals', () => {
  it('adds up the ingredients for the whole batch and per serving', () => {
    const t = recipeTotals(pastaRecipe);
    expect(Math.round(t.calories)).toBe(2537);
    expect(t.protein).toBeCloseTo(109.1, 0);
    expect(Math.round(recipePerServing(pastaRecipe)!.calories)).toBe(634);
    expect(recipePerServing({ ...pastaRecipe, servings: null })).toBeNull();
    expect(ingredients[3].grams).toBe(120); // half of the 240 g cup
  });
});

describe('recipeToItem', () => {
  it('logs a share of the cooked batch by weight, and "1 serving" as weight / servings', () => {
    const item = recipeToItem(pastaRecipe);
    expect(item).toMatchObject({ source: 'recipe', sourceId: pastaRecipe.id, servings: [{ label: '1 serving', grams: 362.5 }] });
    expect(foodKey(item)).toBe(`recipe:${pastaRecipe.id}`);
    expect(hasKnownWeight(item)).toBe(true);

    // 6 oz of a 1,450 g batch is 11.7% of it: about 298 kcal.
    const entry = buildEntry({ id: 'e', date: '2026-10-09', meal: 'dinner', food: item, portion: oz(6), createdAt: '' });
    expect(Math.round(entryNutrition(entry).calories)).toBe(298);
    expect(batchShare(entry.recipe!, entry.grams)).toBeCloseTo((6 * GRAMS_PER_OUNCE) / 1450, 6);

    const serving = buildEntry({ id: 's', date: '2026-10-09', meal: 'dinner', food: item, portion: { quantity: 1, unit: 'serving', serving: item.servings[0] }, createdAt: '' });
    expect(Math.round(entryNutrition(serving).calories)).toBe(634);
  });

  it('with only servings, logs in servings and never shows a weight', () => {
    const item = recipeToItem({ ...pastaRecipe, cookedGrams: null });
    expect(hasKnownWeight(item)).toBe(false);
    const entry = buildEntry({ id: 'e', date: '2026-10-09', meal: 'dinner', food: item, portion: { quantity: 1.5, unit: 'serving', serving: item.servings[0] }, createdAt: '' });
    expect(Math.round(entryNutrition(entry).calories)).toBe(Math.round(634.25 * 1.5));
    expect(formatPortion(entry)).toBe('1.5 × 1 serving');
  });

  it('with only a cooked weight, logs by weight with no serving size', () => {
    const item = recipeToItem({ ...pastaRecipe, servings: null });
    expect(item.servings).toEqual([]);
    expect(hasKnownWeight(item)).toBe(true);
  });
});

describe('ingredient details on an entry', () => {
  it("splits a portion into each ingredient's share", () => {
    const item = recipeToItem(pastaRecipe);
    const entry = buildEntry({ id: 'e', date: '2026-10-09', meal: 'dinner', food: item, portion: oz(6), createdAt: '' });
    const parts = portionIngredients(entry.recipe!, entry.grams);
    expect(parts.map((p) => p.name)).toEqual(ingredients.map((i) => i.food.name));
    const sum = parts.reduce((s, p) => s + p.nutrition.calories, 0);
    expect(sum).toBeCloseTo(entryNutrition(entry).calories, 6);
    expect(parts[0].amount).toBe('8 oz');
  });

  it('survives a database round trip and carries into "log again"', () => {
    const item = recipeToItem(pastaRecipe);
    const entry = buildEntry({ id: '55555555-5555-4555-8555-555555555555', date: '2026-10-09', meal: 'dinner', food: item, portion: oz(6), createdAt: '2026-10-09T00:00:00Z' });
    const row = { ...entryToRow(entry), user_id: 'u', updated_at: entry.createdAt } as Parameters<typeof entryFromRow>[0];
    const back = entryFromRow(JSON.parse(JSON.stringify(row)))!;
    expect(back.recipe).toEqual(entry.recipe);
    expect(foodFromEntry(back).recipe).toEqual(entry.recipe);
    expect(parseRecipeSnapshot({ batchGrams: 'x' })).toBeNull();
  });
});

describe('validateRecipe', () => {
  it('needs a name, ingredients, and servings or a cooked weight', () => {
    const r = validateRecipe({ name: ' ', ingredients: [], servings: null, cookedGrams: null });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['ingredients', 'name', 'servings']);
    expect(validateRecipe({ name: 'x', ingredients, servings: 0, cookedGrams: 50000 }).ok).toBe(false);
    expect(validateRecipe({ name: ' Sausage  pasta ', ingredients, servings: null, cookedGrams: 1450 })).toMatchObject({
      ok: true,
      value: { name: 'Sausage pasta' },
    });
  });
});

describe('recipe rows, queue and search', () => {
  it('round-trips through a row (JSON)', () => {
    const row = { ...recipeToRow('u', pastaRecipe), created_at: pastaRecipe.updatedAt, updated_at: pastaRecipe.updatedAt };
    expect(recipeFromRow(JSON.parse(JSON.stringify(row)))).toEqual(pastaRecipe);
  });

  it('drops malformed rows', () => {
    const row = { ...recipeToRow('u', pastaRecipe), user_id: 'u', servings: 4, cooked_grams: 1450, created_at: '', updated_at: '' };
    expect(recipeFromRow({ ...row, ingredients: [{ food: { name: 'x' } }] })).toBeNull();
    expect(recipeFromRow({ ...row, servings: null, cooked_grams: null })).toBeNull();
  });

  it('applies queued changes and finds recipes by name', () => {
    const curry: Recipe = { ...pastaRecipe, id: '66666666-6666-4666-8666-666666666666', name: 'Chicken curry' };
    const q = enqueueRecipeOp(enqueueRecipeOp([], { kind: 'upsert', recipe: curry }), { kind: 'delete', id: pastaRecipe.id });
    expect(applyRecipeOps([pastaRecipe], q).map((r) => r.name)).toEqual(['Chicken curry']);
    expect(filterRecipes([pastaRecipe, curry], 'PASTA').map((r) => r.name)).toEqual(['Sausage pasta']);
    expect(findRecipeByName([pastaRecipe, curry], ' sausage pasta ')?.id).toBe(pastaRecipe.id);
  });
});
