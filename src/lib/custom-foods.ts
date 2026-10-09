// Custom foods: the user's own foods with nutrition entered from a label, a restaurant menu or a recipe.
// Stored per serving (the way labels list it); the weight of a serving is optional. Pure (queue logic
// mirrors favorites).

import { cleanText, type FoodItem } from './foods';
import { caloriesFromMacros } from './macros';
import { parseNumber } from './settings-form';
import type { Serving } from './units';

export type CustomFood = {
  id: string; // client-generated UUID; food_ref "custom:<id>"
  name: string;
  brand: string | null;
  /** What one serving is, e.g. "1 bowl", "1 bar", "1 serving". */
  servingLabel: string;
  /** Weight of one serving in grams, or null if unknown. */
  servingGrams: number | null;
  /** Per serving. Calories null = not entered: derived from the macros (4/4/9) and flagged. */
  calories: number | null;
  protein: number;
  carbs: number;
  fat: number;
  updatedAt: string; // ISO
};

export const CUSTOM_FOOD_LIMITS = {
  nameLength: 120,
  brandLength: 80,
  servingLabelLength: 60,
  maxServingGrams: 3000,
  maxCalories: 10000,
  maxMacroGrams: 1000,
} as const;

/** Stand-in weight for a serving whose real weight is unknown (never shown; see Serving.weightUnknown). */
const NOMINAL_SERVING_GRAMS = 100;

export type CustomFoodInput = {
  name: string;
  brand?: string | null;
  servingLabel?: string | null;
  servingGrams?: number | null;
  calories?: number | null;
  protein: number;
  carbs: number;
  fat: number;
};

export type CustomFoodField = 'name' | 'brand' | 'servingLabel' | 'servingGrams' | 'calories' | 'protein' | 'carbs' | 'fat';
export type CustomFoodErrors = Partial<Record<CustomFoodField, string>>;

/** "bowl" -> "1 bowl"; "" -> "1 serving"; labels that start with an amount are kept. */
export function normalizeServingLabel(label: string | null | undefined): string {
  const t = cleanText(label ?? '', CUSTOM_FOOD_LIMITS.servingLabelLength);
  if (!t) return '1 serving';
  return /^\d/.test(t) ? t : `1 ${t}`;
}

const inRange = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;

/**
 * Checks and tidies a custom food. Macros are required (0 is fine), calories and serving weight are
 * optional. When the weight is known, the numbers must be physically possible for it.
 */
export function validateCustomFood(
  input: CustomFoodInput
): { ok: true; value: Omit<CustomFood, 'id' | 'updatedAt'> } | { ok: false; errors: CustomFoodErrors } {
  const L = CUSTOM_FOOD_LIMITS;
  const errors: CustomFoodErrors = {};
  const name = cleanText(input.name ?? '', L.nameLength);
  if (!name) errors.name = 'Give the food a name.';
  const brand = cleanText(input.brand ?? '', L.brandLength) || null;
  const servingLabel = normalizeServingLabel(input.servingLabel);

  const grams = input.servingGrams ?? null;
  if (grams !== null && !(Number.isFinite(grams) && grams > 0 && grams <= L.maxServingGrams)) {
    errors.servingGrams = `Enter a weight between 0 and ${L.maxServingGrams} g, or leave it blank.`;
  }
  const calories = input.calories ?? null;
  if (calories !== null && !inRange(calories, L.maxCalories)) errors.calories = `Enter 0 to ${L.maxCalories} kcal, or leave it blank.`;
  for (const k of ['protein', 'carbs', 'fat'] as const) {
    if (!inRange(input[k], L.maxMacroGrams)) errors[k] = `Enter 0 to ${L.maxMacroGrams} g.`;
  }

  if (grams !== null && !errors.servingGrams && !errors.protein && !errors.carbs && !errors.fat) {
    // Macros can't weigh more than the serving; calories can't exceed pure fat (9 kcal/g).
    if (input.protein + input.carbs + input.fat > grams * 1.05) {
      errors.servingGrams = `Protein, carbs and fat add up to more than ${grams} g. Check the weight or the macros.`;
    } else if (calories !== null && !errors.calories && calories > grams * 9.5) {
      errors.calories = `That's more calories than ${grams} g of food can have. Check the calories or the weight.`;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, brand, servingLabel, servingGrams: grams, calories, protein: input.protein, carbs: input.carbs, fat: input.fat },
  };
}

/** Parses the app's form fields (strings) into a CustomFoodInput; blank optional fields become null. */
export function customFoodInputFromForm(form: {
  name: string;
  brand: string;
  servingLabel: string;
  servingGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}): { input: CustomFoodInput; errors: CustomFoodErrors } {
  const errors: CustomFoodErrors = {};
  const optional = (field: CustomFoodField, text: string) => {
    if (!text.trim()) return null;
    const n = parseNumber(text);
    if (n === null) errors[field] = 'Enter a number.';
    return n;
  };
  const required = (field: CustomFoodField, text: string) => {
    if (!text.trim()) return 0; // blank macro = 0 g
    const n = parseNumber(text);
    if (n === null) errors[field] = 'Enter a number.';
    return n ?? 0;
  };
  return {
    input: {
      name: form.name,
      brand: form.brand,
      servingLabel: form.servingLabel,
      servingGrams: optional('servingGrams', form.servingGrams),
      calories: optional('calories', form.calories),
      protein: required('protein', form.protein),
      carbs: required('carbs', form.carbs),
      fat: required('fat', form.fat),
    },
    errors,
  };
}

/** Calories for one serving: as entered, or derived from the macros. */
export function customFoodCalories(f: Pick<CustomFood, 'calories' | 'protein' | 'carbs' | 'fat'>): number {
  return f.calories ?? caloriesFromMacros(f);
}

/** The custom food as a loggable FoodItem (per-100 g values plus its one serving). */
export function customFoodToItem(f: CustomFood): FoodItem {
  const grams = f.servingGrams ?? NOMINAL_SERVING_GRAMS;
  const per100 = (v: number) => (v * 100) / grams;
  const serving: Serving = f.servingGrams === null
    ? { label: f.servingLabel, grams, weightUnknown: true }
    : { label: f.servingLabel, grams };
  return {
    source: 'custom',
    sourceId: f.id,
    name: f.name,
    brand: f.brand,
    per100g: {
      calories: per100(customFoodCalories(f)),
      protein: per100(f.protein),
      carbs: per100(f.carbs),
      fat: per100(f.fat),
    },
    servings: [serving],
    caloriesDerived: f.calories === null,
  };
}

// ---------- Offline queue (same shape as favorites) ----------

export type CustomFoodOp = { kind: 'upsert'; food: CustomFood } | { kind: 'delete'; id: string };

const opId = (op: CustomFoodOp) => (op.kind === 'upsert' ? op.food.id : op.id);
const byName = (a: CustomFood, b: CustomFood) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Add an op, dropping earlier pending ops for the same food (last write wins). */
export function enqueueCustomFoodOp(queue: readonly CustomFoodOp[], op: CustomFoodOp): CustomFoodOp[] {
  return [...queue.filter((q) => opId(q) !== opId(op)), op];
}

/** Server list with pending changes applied, sorted by name. */
export function applyCustomFoodOps(list: readonly CustomFood[], queue: readonly CustomFoodOp[]): CustomFood[] {
  const byId = new Map(list.map((f) => [f.id, f]));
  for (const op of queue) {
    if (op.kind === 'upsert') byId.set(op.food.id, op.food);
    else byId.delete(op.id);
  }
  return [...byId.values()].sort(byName);
}

/** Custom foods whose name or brand contains the query (case-insensitive). Empty query matches all. */
export function filterCustomFoods(list: readonly CustomFood[], query: string): CustomFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter((f) => f.name.toLowerCase().includes(q) || f.brand?.toLowerCase().includes(q));
}

/** The user's custom food with this name (case-insensitive), if any. */
export function findCustomFoodByName(list: readonly CustomFood[], name: string): CustomFood | undefined {
  const n = cleanText(name, CUSTOM_FOOD_LIMITS.nameLength).toLowerCase();
  return list.find((f) => f.name.toLowerCase() === n);
}
