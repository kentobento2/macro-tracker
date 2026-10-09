// Food log entries and the totals derived from them. Pure.

import type { DateKey } from './dates';
import { foodKey, type FoodItem, type FoodSource } from './foods';
import type { RecipeSnapshot } from './recipes';
import { averageNutrition, nutritionForGrams, sumNutrition, type Nutrition } from './macros';
import { portionToGrams, type PortionUnit, type Serving } from './units';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export function isMeal(v: unknown): v is Meal {
  return typeof v === 'string' && (MEALS as readonly string[]).includes(v);
}

export type FoodEntry = {
  id: string;
  date: DateKey;
  meal: Meal;
  foodName: string;
  brand: string | null;
  source: FoodSource;
  sourceId: string | null;
  quantity: number;
  unit: PortionUnit;
  serving: Serving | null; // the serving used when unit is 'serving'
  servings: Serving[]; // all serving sizes the food offered, for editing and re-logging
  grams: number;
  per100g: Nutrition; // snapshot from the source at log time
  createdAt: string; // ISO timestamp
  /** For recipes: the batch's ingredient breakdown at log time. */
  recipe?: RecipeSnapshot | null;
};

export type Portion = {
  quantity: number;
  unit: PortionUnit;
  serving?: Serving | null;
};

export function buildEntry(args: {
  id: string;
  date: DateKey;
  meal: Meal;
  food: FoodItem;
  portion: Portion;
  createdAt: string;
}): FoodEntry {
  const { id, date, meal, food, portion, createdAt } = args;
  if (!(portion.quantity > 0)) throw new RangeError('Portion must be greater than zero.');
  const serving = portion.unit === 'serving' ? (portion.serving ?? null) : null;
  return {
    id,
    date,
    meal,
    foodName: food.name,
    brand: food.brand,
    source: food.source,
    sourceId: food.sourceId,
    quantity: portion.quantity,
    unit: portion.unit,
    serving,
    servings: food.servings,
    grams: portionToGrams(portion.quantity, portion.unit, serving),
    per100g: food.per100g,
    createdAt,
    ...(food.recipe ? { recipe: food.recipe } : {}),
  };
}

export function entryNutrition(e: FoodEntry): Nutrition {
  return nutritionForGrams(e.per100g, e.grams);
}

export function totalNutrition(entries: readonly FoodEntry[]): Nutrition {
  return sumNutrition(entries.map(entryNutrition));
}

export function totalsByMeal(entries: readonly FoodEntry[]): Record<Meal, Nutrition> {
  return Object.fromEntries(
    MEALS.map((m) => [m, totalNutrition(entries.filter((e) => e.meal === m))])
  ) as Record<Meal, Nutrition>;
}

export function entriesByMeal(entries: readonly FoodEntry[]): Record<Meal, FoodEntry[]> {
  const out = Object.fromEntries(MEALS.map((m) => [m, [] as FoodEntry[]])) as Record<Meal, FoodEntry[]>;
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const e of sorted) out[e.meal].push(e);
  return out;
}

/**
 * Average daily intake over `days`, counting only days that have at least one entry
 * (an unlogged day is "unknown", not "ate nothing").
 */
export function averageOverLoggedDays(
  entries: readonly FoodEntry[],
  days: readonly DateKey[]
): { average: Nutrition; daysLogged: number } {
  const daySet = new Set(days);
  const byDay = new Map<DateKey, FoodEntry[]>();
  for (const e of entries) {
    if (!daySet.has(e.date)) continue;
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  }
  const totals = [...byDay.values()].map(totalNutrition);
  return { average: averageNutrition(totals), daysLogged: totals.length };
}

/** Rebuild a FoodItem from a logged entry, for "recent foods". */
export function foodFromEntry(e: FoodEntry): FoodItem {
  // Make sure the serving the entry was logged with is offered too.
  const used = e.serving;
  const servings = used && !e.servings.some((s) => s.label === used.label) ? [used, ...e.servings] : e.servings;
  return {
    source: e.source,
    sourceId: e.sourceId,
    name: e.foodName,
    brand: e.brand,
    per100g: e.per100g,
    servings,
    caloriesDerived: false,
    ...(e.recipe ? { recipe: e.recipe } : {}),
  };
}

/** Most recently logged distinct foods, newest first. */
export function recentFoods(entries: readonly FoodEntry[], limit: number): { food: FoodItem; last: FoodEntry }[] {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const out: { food: FoodItem; last: FoodEntry }[] = [];
  for (const e of sorted) {
    const key = foodKey({ source: e.source, sourceId: e.sourceId, name: e.foodName });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ food: foodFromEntry(e), last: e });
    if (out.length >= limit) break;
  }
  return out;
}

/** Default meal for a new entry based on local time of day. */
export function mealForTime(hours: number, minutes = 0): Meal {
  const t = hours * 60 + minutes;
  if (t < 10 * 60 + 30) return 'breakfast';
  if (t < 15 * 60) return 'lunch';
  if (t < 21 * 60) return 'dinner';
  return 'snacks';
}
