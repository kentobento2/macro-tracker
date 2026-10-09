// Pure macro math. No React, no I/O — keep it that way so it stays easy to test.

export type Macros = {
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
};

export const KCAL_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const;

export const ZERO_MACROS: Macros = { protein: 0, carbs: 0, fat: 0 };

/** Calories implied by a set of macros (Atwater factors). */
export function caloriesFromMacros(m: Macros): number {
  return m.protein * KCAL_PER_GRAM.protein + m.carbs * KCAL_PER_GRAM.carbs + m.fat * KCAL_PER_GRAM.fat;
}

/** Sum a list of macro entries. */
export function sumMacros(entries: readonly Macros[]): Macros {
  return entries.reduce<Macros>(
    (acc, e) => ({
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    ZERO_MACROS
  );
}

/** Scale per-serving macros by a number of servings. */
export function scaleMacros(m: Macros, servings: number): Macros {
  if (!Number.isFinite(servings) || servings < 0) {
    throw new RangeError(`servings must be a non-negative number, got ${servings}`);
  }
  return {
    protein: m.protein * servings,
    carbs: m.carbs * servings,
    fat: m.fat * servings,
  };
}

/** Target minus consumed, per macro. Negative means over target. */
export function remainingMacros(target: Macros, consumed: Macros): Macros {
  return {
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
  };
}
