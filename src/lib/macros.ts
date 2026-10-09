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

/**
 * Share of calories coming from each macro (4/4/9), as whole percentages.
 * Based on macro calories rather than listed calories, so the three always add up to ~100.
 */
export function macroCaloriePercents(m: Macros): Macros {
  const total = caloriesFromMacros(m);
  if (!(total > 0)) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round(((m.protein * KCAL_PER_GRAM.protein) / total) * 100),
    carbs: Math.round(((m.carbs * KCAL_PER_GRAM.carbs) / total) * 100),
    fat: Math.round(((m.fat * KCAL_PER_GRAM.fat) / total) * 100),
  };
}

/** Whole percent of a target (not clamped; 130 means 30% over). A missing target gives 0. */
export function percentOfTarget(value: number, target: number): number {
  return target > 0 ? Math.round((value / target) * 100) : 0;
}

/**
 * Layout for a value-vs-target bar with a marker at the target. The track spans 0..max(target × headroom, value),
 * so going over the target is visible past the marker. Fractions are 0..1 of the track width.
 */
export function targetBar(value: number, target: number, headroom = 1.25): { fill: number; marker: number; over: boolean } {
  if (!(target > 0)) return { fill: 0, marker: 0, over: false };
  const max = Math.max(target * headroom, value);
  return { fill: Math.max(0, value) / max, marker: target / max, over: value > target };
}
