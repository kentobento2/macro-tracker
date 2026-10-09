// Daily calorie and macro targets from body stats. Pure.
//
// Method:
// - BMR: Mifflin-St Jeor.
// - TDEE: BMR x activity multiplier.
// - Goal: lose = -500 kcal/day (~0.5 kg / 1 lb per week), gain = +250 kcal/day (lean gain).
// - Floor: 1200 kcal (female) / 1500 kcal (male).
// - Protein: g per kg bodyweight by goal. Fat: 30% of calories. Carbs: the rest.

import { KCAL_PER_GRAM } from './macros';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export type BodyStats = {
  sex: Sex;
  age: number; // years
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
};

export type Targets = {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
};

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // desk job, little exercise
  light: 1.375, // exercise 1-3 days/week
  moderate: 1.55, // exercise 3-5 days/week
  active: 1.725, // exercise 6-7 days/week
  very_active: 1.9, // hard training or physical job
};

export const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 250,
};

export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose: 2.0,
  maintain: 1.6,
  gain: 1.8,
};

export const MIN_CALORIES: Record<Sex, number> = { female: 1200, male: 1500 };
export const FAT_CALORIE_SHARE = 0.3;

/** Basal metabolic rate (kcal/day), Mifflin-St Jeor. */
export function bmr({ sex, age, heightCm, weightKg }: Pick<BodyStats, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/** Total daily energy expenditure (kcal/day). */
export function tdee(stats: BodyStats): number {
  return bmr(stats) * ACTIVITY_MULTIPLIERS[stats.activityLevel];
}

export function validateBodyStats(s: BodyStats): string[] {
  const errors: string[] = [];
  if (!(s.age >= 13 && s.age <= 120)) errors.push('Age must be between 13 and 120.');
  if (!(s.heightCm >= 90 && s.heightCm <= 250)) errors.push('Height looks out of range.');
  if (!(s.weightKg >= 25 && s.weightKg <= 400)) errors.push('Weight looks out of range.');
  return errors;
}

/** Suggested daily targets. Calories rounded to 10 kcal, macros to whole grams. */
export function computeTargets(stats: BodyStats): Targets {
  const errors = validateBodyStats(stats);
  if (errors.length) throw new RangeError(errors.join(' '));

  const raw = tdee(stats) + GOAL_CALORIE_ADJUSTMENT[stats.goal];
  const calories = Math.round(Math.max(raw, MIN_CALORIES[stats.sex]) / 10) * 10;

  // Cap protein at 35% of calories so very heavy bodyweights don't crowd out everything else.
  const proteinFromWeight = PROTEIN_G_PER_KG[stats.goal] * stats.weightKg;
  const proteinCap = (calories * 0.35) / KCAL_PER_GRAM.protein;
  const protein = Math.round(Math.min(proteinFromWeight, proteinCap));

  const fat = Math.round((calories * FAT_CALORIE_SHARE) / KCAL_PER_GRAM.fat);

  const carbKcal = calories - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat;
  const carbs = Math.max(0, Math.round(carbKcal / KCAL_PER_GRAM.carbs));

  return { calories, protein, carbs, fat };
}
