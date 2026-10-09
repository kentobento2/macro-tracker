// Turning spoken meal descriptions into foods and portions. Pure.
// - resolvePortion: "2 cups", "1 banana", "0.5 lb", "250 ml" -> a portion of a specific food
// - scoreMatch / rankFoods: how well a food's name matches what the user said

import type { Portion } from './entries';
import type { FoodItem } from './foods';
import { GRAMS_PER_OUNCE, portionToGrams, type Serving } from './units';

/** Largest single item we accept: 3 kg, or 50 servings. Anything bigger is almost certainly a mistake. */
export const MAX_ITEM_GRAMS = 3000;
export const MAX_SERVINGS = 50;

const GRAMS_PER: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilo: 1000,
  kilos: 1000,
  kilogram: 1000,
  kilograms: 1000,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
};
const OUNCES = new Set(['oz', 'ounce', 'ounces']);
const MILLILITERS: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
};
const GENERIC_SERVING = new Set(['serving', 'servings', 'portion', 'portions', 'each', 'whole', 'item', 'items', 'x']);
const UNIT_ALIASES: Record<string, string> = {
  tbsp: 'tablespoon',
  tbs: 'tablespoon',
  tbl: 'tablespoon',
  tsp: 'teaspoon',
  pc: 'piece',
  pcs: 'piece',
  c: 'cup',
};

export type ResolvedPortion = { portion: Portion; grams: number; note?: string };
export type PortionResult = { ok: true; value: ResolvedPortion } | { ok: false; error: string };

const singular = (w: string) =>
  w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(singular);

/** Leading amount of a serving label: "1 cup" -> 1, "1/2 cup" -> 0.5, "1 1/2 cups" -> 1.5, "cup" -> 1. */
export function labelAmount(label: string): number {
  // Try a plain fraction first so "1/2 cup" isn't read as "1".
  const m = label.trim().match(/^(\d+)\/(\d+)|^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?/);
  if (!m) return 1;
  if (m[1]) return Number(m[1]) / Number(m[2]);
  const whole = Number(m[3]);
  return m[4] ? whole + Number(m[4]) / Number(m[5]) : whole;
}

function findServing(servings: readonly Serving[], unitWord: string): Serving | null {
  const target = singular(UNIT_ALIASES[unitWord] ?? unitWord);
  return servings.find((s) => words(s.label).includes(target)) ?? null;
}

function checkSize(grams: number, servings?: number): string | null {
  if (servings !== undefined && servings > MAX_SERVINGS) return `That's more than ${MAX_SERVINGS} servings in one item.`;
  if (grams > MAX_ITEM_GRAMS) return `That's more than ${MAX_ITEM_GRAMS / 1000} kg in one item.`;
  return null;
}

/**
 * Resolve "quantity unit" against a food. Mass units convert directly; household units ("cup", "slice",
 * "banana") match one of the food's serving sizes; "serving" uses its first serving.
 */
export function resolvePortion(food: FoodItem, quantity: number, unitRaw: string): PortionResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: 'Quantity must be a number greater than zero.' };
  }
  const unit = unitRaw.trim().toLowerCase().replace(/\.$/, '');

  if (unit in GRAMS_PER) {
    const grams = quantity * GRAMS_PER[unit];
    const tooBig = checkSize(grams);
    if (tooBig) return { ok: false, error: tooBig };
    return { ok: true, value: { portion: { quantity: grams, unit: 'g' }, grams } };
  }
  if (OUNCES.has(unit)) {
    const grams = quantity * GRAMS_PER_OUNCE;
    const tooBig = checkSize(grams);
    if (tooBig) return { ok: false, error: tooBig };
    return { ok: true, value: { portion: { quantity, unit: 'oz' }, grams } };
  }
  if (unit in MILLILITERS) {
    const grams = quantity * MILLILITERS[unit];
    const tooBig = checkSize(grams);
    if (tooBig) return { ok: false, error: tooBig };
    return {
      ok: true,
      value: {
        portion: { quantity: grams, unit: 'g' },
        grams,
        note: 'Volume converted assuming 1 ml ≈ 1 g (accurate for milk and drinks, rough for others).',
      },
    };
  }

  const serving = GENERIC_SERVING.has(unit) ? (food.servings[0] ?? null) : findServing(food.servings, unit);
  if (!serving) {
    const options = food.servings.map((s) => `"${s.label}"`).join(', ');
    return {
      ok: false,
      error:
        `"${food.name}" has no "${unitRaw}" serving size. ` +
        (options ? `Available servings: ${options}. ` : '') +
        'Use one of those, or give the amount in grams or ounces.',
    };
  }
  // A label like "1/2 cup (120 g)" is half a cup per serving, so "1 cup" is 2 servings.
  const servings = GENERIC_SERVING.has(unit) ? quantity : quantity / labelAmount(serving.label);
  const grams = portionToGrams(servings, 'serving', serving);
  const tooBig = checkSize(grams, servings);
  if (tooBig) return { ok: false, error: tooBig };
  return { ok: true, value: { portion: { quantity: servings, unit: 'serving', serving }, grams } };
}

// ---------- Name matching ----------

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'my', 'some', 'in', 'on']);

export function nameTokens(s: string): string[] {
  return [...new Set(words(s).filter((w) => !STOPWORDS.has(w)))];
}

/**
 * 0..1: mostly how many of the user's words appear in the food (coverage), a little for how few extra words
 * the food has (precision). Preparation words ("grilled") only add a small bonus when present.
 */
export function scoreMatch(query: string, food: Pick<FoodItem, 'name' | 'brand'>, preparation?: string): number {
  const q = nameTokens(query);
  const f = nameTokens(`${food.name} ${food.brand ?? ''}`);
  if (q.length === 0 || f.length === 0) return 0;
  const hits = q.filter((w) => f.includes(w)).length;
  const coverage = hits / q.length;
  const precision = hits / f.length;
  const prep = preparation ? nameTokens(preparation) : [];
  const prepBonus = prep.length ? (0.05 * prep.filter((w) => f.includes(w)).length) / prep.length : 0;
  return Math.min(1, 0.75 * coverage + 0.25 * precision + prepBonus);
}

/** A match must cover every word the user said (score >= this) to be used without asking. */
export const MIN_MATCH_SCORE = 0.75;

/** Foods scored and sorted best first; ties keep the original (relevance) order. */
export function rankFoods<T extends Pick<FoodItem, 'name' | 'brand'>>(
  query: string,
  foods: readonly T[],
  preparation?: string
): { food: T; score: number }[] {
  return foods
    .map((food, i) => ({ food, score: scoreMatch(query, food, preparation), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ food, score }) => ({ food, score }));
}
