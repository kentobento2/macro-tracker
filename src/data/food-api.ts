// Food search and barcode lookup through the `food-lookup` Edge Function.

import { FunctionsHttpError } from '@supabase/supabase-js';

import { normalizeOffProduct, normalizeUsdaFood, type FoodItem, type OffProduct, type UsdaFood } from '@/lib/foods';
import { supabase } from '@/lib/supabase';

export class FoodLookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'rate_limited' | 'failed'
  ) {
    super(message);
  }
}

async function invoke<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('food-lookup', { body });
  if (!error && data) return data;

  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    const status = error.context.status;
    if (status === 429) {
      throw new FoodLookupError('The food database is busy. Try again in a minute.', 'rate_limited');
    }
    throw new FoodLookupError('Food lookup failed. Try again.', 'failed');
  }
  throw new FoodLookupError("Can't reach the food database. Check your connection.", 'offline');
}

export type SearchResults = { whole: FoodItem[]; branded: FoodItem[] };

const normalizeAll = (list: UsdaFood[] | undefined) =>
  (list ?? []).map(normalizeUsdaFood).filter((f): f is FoodItem => f !== null);

/** USDA whole foods (Foundation / SR Legacy / Survey) and USDA branded products, as separate lists. */
export async function searchFoods(query: string): Promise<SearchResults> {
  const { foods, branded } = await invoke<{ foods: UsdaFood[]; branded?: UsdaFood[] }>({ type: 'search', query });
  return { whole: normalizeAll(foods), branded: normalizeAll(branded) };
}

/** Returns null when the barcode isn't in Open Food Facts or has no nutrition data. */
export async function lookupBarcode(code: string): Promise<FoodItem | null> {
  const { product } = await invoke<{ product: OffProduct | null }>({ type: 'barcode', code });
  return product ? normalizeOffProduct(product, code) : null;
}
