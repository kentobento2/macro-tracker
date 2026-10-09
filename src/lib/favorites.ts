// Favorite foods: a food snapshot plus a default portion. Pure (queue logic mirrors the weight queue).

import type { Portion } from './entries';
import { foodKey, type FoodItem } from './foods';

export type Favorite = {
  key: string; // foodKey(food)
  food: FoodItem;
  portion: Required<Portion>; // serving is null unless unit is 'serving'
  savedAt: string; // ISO; newest first in lists
};

export function makeFavorite(food: FoodItem, portion: Portion, savedAt: string): Favorite {
  const serving = portion.unit === 'serving' ? (portion.serving ?? null) : null;
  if (!(portion.quantity > 0)) throw new RangeError('Portion must be greater than zero.');
  if (portion.unit === 'serving' && !serving) throw new Error('A serving is required for unit "serving".');
  return { key: foodKey(food), food, portion: { quantity: portion.quantity, unit: portion.unit, serving }, savedAt };
}

export type FavoriteOp = { kind: 'upsert'; favorite: Favorite } | { kind: 'delete'; key: string };

const opKey = (op: FavoriteOp) => (op.kind === 'upsert' ? op.favorite.key : op.key);
const newestFirst = (a: Favorite, b: Favorite) => b.savedAt.localeCompare(a.savedAt);

/** Add an op, dropping earlier pending ops for the same food (last write wins). */
export function enqueueFavoriteOp(queue: readonly FavoriteOp[], op: FavoriteOp): FavoriteOp[] {
  return [...queue.filter((q) => opKey(q) !== opKey(op)), op];
}

/** Server list with pending changes applied, newest first. */
export function applyFavoriteOps(list: readonly Favorite[], queue: readonly FavoriteOp[]): Favorite[] {
  const byKey = new Map(list.map((f) => [f.key, f]));
  for (const op of queue) {
    if (op.kind === 'upsert') byKey.set(op.favorite.key, op.favorite);
    else byKey.delete(op.key);
  }
  return [...byKey.values()].sort(newestFirst);
}

/** Favorites whose name or brand contains the query (case-insensitive). Empty query matches all. */
export function filterFavorites(list: readonly Favorite[], query: string): Favorite[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter((f) => f.food.name.toLowerCase().includes(q) || f.food.brand?.toLowerCase().includes(q));
}
