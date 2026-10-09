// Pure macro math. No React, no I/O — keep it that way so it stays easy to test.

export type Macros = {
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
};

export type Nutrition = Macros & {
  calories: number; // kcal
};

export const KCAL_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const;

export const ZERO_NUTRITION: Nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** Calories implied by a set of macros (Atwater factors). */
export function caloriesFromMacros(m: Macros): number {
  return m.protein * KCAL_PER_GRAM.protein + m.carbs * KCAL_PER_GRAM.carbs + m.fat * KCAL_PER_GRAM.fat;
}

/** Sum a list of nutrition values. */
export function sumNutrition(items: readonly Nutrition[]): Nutrition {
  return items.reduce<Nutrition>(
    (acc, n) => ({
      calories: acc.calories + n.calories,
      protein: acc.protein + n.protein,
      carbs: acc.carbs + n.carbs,
      fat: acc.fat + n.fat,
    }),
    ZERO_NUTRITION
  );
}

/** Multiply every value by a factor. */
export function scaleNutrition(n: Nutrition, factor: number): Nutrition {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new RangeError(`factor must be a non-negative number, got ${factor}`);
  }
  return {
    calories: n.calories * factor,
    protein: n.protein * factor,
    carbs: n.carbs * factor,
    fat: n.fat * factor,
  };
}

/** Nutrition for a given weight of a food whose values are per 100 g. */
export function nutritionForGrams(per100g: Nutrition, grams: number): Nutrition {
  if (!Number.isFinite(grams) || grams < 0) {
    throw new RangeError(`grams must be a non-negative number, got ${grams}`);
  }
  return scaleNutrition(per100g, grams / 100);
}

/** Target minus consumed. Negative means over target. */
export function remainingNutrition(target: Nutrition, consumed: Nutrition): Nutrition {
  return {
    calories: target.calories - consumed.calories,
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
  };
}

/** Mean of a list of daily totals. Empty list averages to zero. */
export function averageNutrition(days: readonly Nutrition[]): Nutrition {
  if (days.length === 0) return ZERO_NUTRITION;
  return scaleNutrition(sumNutrition(days), 1 / days.length);
}

/** Fraction of target reached, clamped to [0, 1]. A zero target counts as 0. */
export function progress(consumed: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.min(1, Math.max(0, consumed / target));
}
