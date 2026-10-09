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

export async function searchFoods(query: string): Promise<FoodItem[]> {
  const { foods } = await invoke<{ foods: UsdaFood[] }>({ type: 'search', query });
  return foods.map(normalizeUsdaFood).filter((f): f is FoodItem => f !== null);
}

/** Returns null when the barcode isn't in Open Food Facts or has no nutrition data. */
export async function lookupBarcode(code: string): Promise<FoodItem | null> {
  const { product } = await invoke<{ product: OffProduct | null }>({ type: 'barcode', code });
  return product ? normalizeOffProduct(product, code) : null;
}
