// Recipes: dishes made from several ingredients. The batch's nutrition is the sum of its ingredients; a
// portion is a share of the batch by cooked weight (most accurate) or by servings. Pure (queue logic
// mirrors custom foods).

import { cleanText, type FoodItem } from './foods';
import { formatPortion } from './format';
import { nutritionForGrams, sumNutrition, type Nutrition } from './macros';
import type { Portion } from './entries';
import { portionToGrams, type PortionUnit, type Serving } from './units';

export type RecipeIngredient = {
  /** Snapshot of the food when it was added (so the recipe never changes if a database does). */
  food: FoodItem;
  quantity: number;
  unit: PortionUnit;
  serving: Serving | null;
  grams: number;
};

export type Recipe = {
  id: string; // client-generated UUID; food_ref "recipe:<id>"
  name: string;
  ingredients: RecipeIngredient[];
  /** How many servings the batch makes, if known. */
  servings: number | null;
  /** Weight of the whole cooked batch in grams, if known (weigh the pot, minus the pot). */
  cookedGrams: number | null;
  updatedAt: string; // ISO
};

/**
 * Ingredient breakdown kept on a logged entry, for "show ingredients". Values are for the whole batch;
 * an entry's share is entry.grams / batchGrams.
 */
export type RecipeSnapshot = {
  batchGrams: number;
  ingredients: { name: string; brand: string | null; amount: string; nutrition: Nutrition }[];
};

export const RECIPE_LIMITS = {
  nameLength: 120,
  maxIngredients: 50,
  maxServings: 100,
  maxCookedGrams: 20000,
} as const;

/** Stand-in weight per serving when only the number of servings is known (never shown). */
const NOMINAL_SERVING_GRAMS = 100;

/** An ingredient from a food and the amount used. */
export function makeIngredient(food: FoodItem, portion: Portion): RecipeIngredient {
  if (!(portion.quantity > 0)) throw new RangeError('Amount must be greater than zero.');
  const serving = portion.unit === 'serving' ? (portion.serving ?? null) : null;
  // A recipe can't contain a recipe; drop any nested breakdown from the snapshot.
  const { recipe: _nested, ...snapshot } = food;
  return {
    food: snapshot,
    quantity: portion.quantity,
    unit: portion.unit,
    serving,
    grams: portionToGrams(portion.quantity, portion.unit, serving),
  };
}

export const ingredientNutrition = (i: RecipeIngredient): Nutrition => nutritionForGrams(i.food.per100g, i.grams);

/** "8 oz", "0.5 × 1 cup (120 g)", "1 bowl". */
export const ingredientAmount = (i: RecipeIngredient) =>
  formatPortion({ quantity: i.quantity, unit: i.unit, serving: i.serving, grams: i.grams });

/** Nutrition of the whole batch. */
export function recipeTotals(r: Pick<Recipe, 'ingredients'>): Nutrition {
  return sumNutrition(r.ingredients.map(ingredientNutrition));
}

/** Nutrition of one serving, or null if the number of servings isn't set. */
export function recipePerServing(r: Pick<Recipe, 'ingredients' | 'servings'>): Nutrition | null {
  if (!r.servings) return null;
  const t = recipeTotals(r);
  const k = 1 / r.servings;
  return { calories: t.calories * k, protein: t.protein * k, carbs: t.carbs * k, fat: t.fat * k };
}

export type RecipeInput = {
  name: string;
  ingredients: readonly RecipeIngredient[];
  servings: number | null;
  cookedGrams: number | null;
};
export type RecipeField = 'name' | 'ingredients' | 'servings' | 'cookedGrams';
export type RecipeErrors = Partial<Record<RecipeField, string>>;

/** A recipe needs a name, at least one ingredient, and servings and/or a cooked weight. */
export function validateRecipe(
  input: RecipeInput
): { ok: true; value: Omit<Recipe, 'id' | 'updatedAt'> } | { ok: false; errors: RecipeErrors } {
  const L = RECIPE_LIMITS;
  const errors: RecipeErrors = {};
  const name = cleanText(input.name ?? '', L.nameLength);
  if (!name) errors.name = 'Give the recipe a name.';
  if (input.ingredients.length === 0) errors.ingredients = 'Add at least one ingredient.';
  else if (input.ingredients.length > L.maxIngredients) errors.ingredients = `A recipe can have up to ${L.maxIngredients} ingredients.`;
  const { servings, cookedGrams } = input;
  if (servings !== null && !(Number.isFinite(servings) && servings > 0 && servings <= L.maxServings)) {
    errors.servings = `Enter 1 to ${L.maxServings} servings, or leave it blank.`;
  }
  if (cookedGrams !== null && !(Number.isFinite(cookedGrams) && cookedGrams > 0 && cookedGrams <= L.maxCookedGrams)) {
    errors.cookedGrams = `Enter a weight up to ${L.maxCookedGrams} g, or leave it blank.`;
  }
  if (servings === null && cookedGrams === null) {
    errors.servings = 'Enter how many servings it makes, the cooked weight, or both.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, ingredients: [...input.ingredients], servings, cookedGrams } };
}

/**
 * The recipe as a loggable FoodItem. With a cooked weight, any amount in grams/oz is a share of the batch
 * and "1 serving" is the weight divided by the servings. With only servings, it's logged in servings.
 */
export function recipeToItem(r: Recipe): FoodItem {
  const totals = recipeTotals(r);
  const scale = (k: number): Nutrition => ({
    calories: totals.calories * k,
    protein: totals.protein * k,
    carbs: totals.carbs * k,
    fat: totals.fat * k,
  });
  let batchGrams: number;
  let servings: Serving[];
  if (r.cookedGrams) {
    batchGrams = r.cookedGrams;
    servings = r.servings ? [{ label: '1 serving', grams: r.cookedGrams / r.servings }] : [];
  } else {
    const n = r.servings ?? 1;
    batchGrams = n * NOMINAL_SERVING_GRAMS;
    servings = [{ label: '1 serving', grams: NOMINAL_SERVING_GRAMS, weightUnknown: true }];
  }
  return {
    source: 'recipe',
    sourceId: r.id,
    name: r.name,
    brand: null,
    per100g: scale(100 / batchGrams),
    servings,
    caloriesDerived: r.ingredients.some((i) => i.food.caloriesDerived),
    recipe: {
      batchGrams,
      ingredients: r.ingredients.map((i) => ({
        name: i.food.name,
        brand: i.food.brand,
        amount: ingredientAmount(i),
        nutrition: ingredientNutrition(i),
      })),
    },
  };
}

/** Each ingredient's share in a portion of `grams` (same gram scale as the entry). */
export function portionIngredients(snapshot: RecipeSnapshot, grams: number) {
  const k = snapshot.batchGrams > 0 ? grams / snapshot.batchGrams : 0;
  return snapshot.ingredients.map((i) => ({
    name: i.name,
    brand: i.brand,
    amount: i.amount,
    nutrition: {
      calories: i.nutrition.calories * k,
      protein: i.nutrition.protein * k,
      carbs: i.nutrition.carbs * k,
      fat: i.nutrition.fat * k,
    },
  }));
}

/** The share of the batch a portion is, e.g. 0.117 for 170 g of a 1,450 g batch. */
export const batchShare = (snapshot: RecipeSnapshot, grams: number) =>
  snapshot.batchGrams > 0 ? grams / snapshot.batchGrams : 0;

// ---------- Offline queue (same shape as custom foods) ----------

export type RecipeOp = { kind: 'upsert'; recipe: Recipe } | { kind: 'delete'; id: string };

const opId = (op: RecipeOp) => (op.kind === 'upsert' ? op.recipe.id : op.id);
const byName = (a: Recipe, b: Recipe) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function enqueueRecipeOp(queue: readonly RecipeOp[], op: RecipeOp): RecipeOp[] {
  return [...queue.filter((q) => opId(q) !== opId(op)), op];
}

export function applyRecipeOps(list: readonly Recipe[], queue: readonly RecipeOp[]): Recipe[] {
  const byId = new Map(list.map((r) => [r.id, r]));
  for (const op of queue) {
    if (op.kind === 'upsert') byId.set(op.recipe.id, op.recipe);
    else byId.delete(op.id);
  }
  return [...byId.values()].sort(byName);
}

export function filterRecipes(list: readonly Recipe[], query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter((r) => r.name.toLowerCase().includes(q));
}

export function findRecipeByName(list: readonly Recipe[], name: string): Recipe | undefined {
  const n = cleanText(name, RECIPE_LIMITS.nameLength).toLowerCase();
  return list.find((r) => r.name.toLowerCase() === n);
}
