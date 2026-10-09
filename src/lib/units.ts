// Unit conversions. Pure.

export const GRAMS_PER_OUNCE = 28.349523125;
export const KG_PER_POUND = 0.45359237;
export const CM_PER_INCH = 2.54;

export type PortionUnit = 'g' | 'oz' | 'serving';

export type Serving = {
  label: string; // e.g. "1 banana", "1 cup"
  grams: number;
  /**
   * The real weight isn't known (a custom food like "1 restaurant bowl"): `grams` is a stand-in so the
   * per-100 g math works, and must never be shown or used to convert to grams/ounces.
   */
  weightUnknown?: boolean;
};

/** False when a food's servings have no real weight, so it can only be logged in servings. */
export function hasKnownWeight(food: { servings: readonly Serving[] }): boolean {
  return !food.servings.some((s) => s.weightUnknown);
}

/** Weight in grams of a portion. `serving` is required when unit is 'serving'. */
export function portionToGrams(quantity: number, unit: PortionUnit, serving?: Serving | null): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`quantity must be a non-negative number, got ${quantity}`);
  }
  switch (unit) {
    case 'g':
      return quantity;
    case 'oz':
      return quantity * GRAMS_PER_OUNCE;
    case 'serving':
      if (!serving || !(serving.grams > 0)) {
        throw new Error('A serving with a positive gram weight is required for unit "serving"');
      }
      return quantity * serving.grams;
  }
}

export const poundsToKg = (lb: number) => lb * KG_PER_POUND;
export const kgToPounds = (kg: number) => kg / KG_PER_POUND;

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

/** Whole feet plus inches rounded to the nearest inch (never 12). */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** Inverse of portionToGrams: how many of `unit` make up `grams`. Used when switching units. */
export function gramsToQuantity(grams: number, unit: PortionUnit, serving?: Serving | null): number {
  return grams / portionToGrams(1, unit, serving);
}
