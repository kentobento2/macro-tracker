// Mapping between database rows (snake_case) and app types. Pure.

import type { Database } from './database.types';
import type { WeighIn } from './bodyweight';
import { isDateKey } from './dates';
import { isMeal, type FoodEntry } from './entries';
import type { Favorite } from './favorites';
import type { FoodSource } from './foods';
import type { ActivityLevel, Goal, Sex, Targets } from './targets';
import type { PortionUnit, Serving } from './units';

type EntryRow = Database['public']['Tables']['food_entries']['Row'];
type EntryInsert = Database['public']['Tables']['food_entries']['Insert'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

export type UnitSystem = 'metric' | 'imperial';

export type Profile = {
  unitSystem: UnitSystem;
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  targets: Targets | null;
};

const SOURCES: readonly FoodSource[] = ['usda', 'off', 'custom'];
const UNITS: readonly PortionUnit[] = ['g', 'oz', 'serving'];
const SEXES: readonly Sex[] = ['male', 'female'];
const ACTIVITY: readonly ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];

const oneOf = <T extends string>(allowed: readonly T[], v: unknown): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;

function parseServings(v: unknown): Serving[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((s) =>
    s && typeof s.label === 'string' && Number(s.grams) > 0 ? [{ label: s.label, grams: Number(s.grams) }] : []
  );
}

/** Returns null for rows that don't match the app's expectations (defensive; the DB has checks too). */
export function entryFromRow(r: EntryRow): FoodEntry | null {
  const source = oneOf(SOURCES, r.source);
  const unit = oneOf(UNITS, r.unit);
  if (!source || !unit || !isMeal(r.meal) || !isDateKey(r.entry_date)) return null;
  return {
    id: r.id,
    date: r.entry_date,
    meal: r.meal,
    foodName: r.food_name,
    brand: r.brand,
    source,
    sourceId: r.source_id,
    quantity: Number(r.quantity),
    unit,
    serving:
      r.serving_grams !== null ? { label: r.serving_label ?? 'serving', grams: Number(r.serving_grams) } : null,
    servings: parseServings(r.servings),
    grams: Number(r.grams),
    per100g: {
      calories: Number(r.kcal_per_100g),
      protein: Number(r.protein_per_100g),
      carbs: Number(r.carbs_per_100g),
      fat: Number(r.fat_per_100g),
    },
    createdAt: r.created_at,
  };
}

export function entryToRow(e: FoodEntry): EntryInsert {
  return {
    id: e.id,
    entry_date: e.date,
    meal: e.meal,
    food_name: e.foodName,
    brand: e.brand,
    source: e.source,
    source_id: e.sourceId,
    quantity: e.quantity,
    unit: e.unit,
    serving_grams: e.serving?.grams ?? null,
    serving_label: e.serving?.label ?? null,
    servings: e.servings,
    grams: e.grams,
    kcal_per_100g: e.per100g.calories,
    protein_per_100g: e.per100g.protein,
    carbs_per_100g: e.per100g.carbs,
    fat_per_100g: e.per100g.fat,
    created_at: e.createdAt,
  };
}

const numOrNull = (v: number | null) => (v === null ? null : Number(v));

export function profileFromRow(r: ProfileRow): Profile {
  const t = [r.target_calories, r.target_protein_g, r.target_carbs_g, r.target_fat_g];
  return {
    unitSystem: oneOf(['metric', 'imperial'] as const, r.unit_system) ?? 'imperial',
    sex: oneOf(SEXES, r.sex),
    age: numOrNull(r.age),
    heightCm: numOrNull(r.height_cm),
    weightKg: numOrNull(r.weight_kg),
    activityLevel: oneOf(ACTIVITY, r.activity_level),
    goal: oneOf(GOALS, r.goal),
    targets: t.every((x) => x !== null)
      ? { calories: t[0]!, protein: t[1]!, carbs: t[2]!, fat: t[3]! }
      : null,
  };
}

export function profileToRow(userId: string, p: Profile): ProfileInsert {
  return {
    id: userId,
    unit_system: p.unitSystem,
    sex: p.sex,
    age: p.age,
    height_cm: p.heightCm,
    weight_kg: p.weightKg,
    activity_level: p.activityLevel,
    goal: p.goal,
    target_calories: p.targets?.calories ?? null,
    target_protein_g: p.targets?.protein ?? null,
    target_carbs_g: p.targets?.carbs ?? null,
    target_fat_g: p.targets?.fat ?? null,
  };
}

type WeightRow = Database['public']['Tables']['body_weights']['Row'];
type WeightInsert = Database['public']['Tables']['body_weights']['Insert'];

export function weighInFromRow(r: WeightRow): WeighIn | null {
  if (!isDateKey(r.entry_date)) return null;
  const weightKg = Number(r.weight_kg);
  return Number.isFinite(weightKg) ? { date: r.entry_date, weightKg, note: r.note } : null;
}

export function weighInToRow(userId: string, w: WeighIn): WeightInsert {
  const note = w.note?.trim();
  return { user_id: userId, entry_date: w.date, weight_kg: w.weightKg, note: note ? note : null };
}

type FavoriteRow = Database['public']['Tables']['favorite_foods']['Row'];
type FavoriteInsert = Database['public']['Tables']['favorite_foods']['Insert'];

export function favoriteFromRow(r: FavoriteRow): Favorite | null {
  const source = oneOf(SOURCES, r.source);
  const unit = oneOf(UNITS, r.unit);
  if (!source || !unit) return null;
  const serving =
    r.serving_grams !== null ? { label: r.serving_label ?? 'serving', grams: Number(r.serving_grams) } : null;
  if (unit === 'serving' && !serving) return null;
  return {
    key: r.food_key,
    food: {
      source,
      sourceId: r.source_id,
      name: r.food_name,
      brand: r.brand,
      per100g: {
        calories: Number(r.kcal_per_100g),
        protein: Number(r.protein_per_100g),
        carbs: Number(r.carbs_per_100g),
        fat: Number(r.fat_per_100g),
      },
      servings: parseServings(r.servings),
      caloriesDerived: false,
    },
    portion: { quantity: Number(r.quantity), unit, serving: unit === 'serving' ? serving : null },
    savedAt: r.updated_at,
  };
}

export function favoriteToRow(userId: string, f: Favorite): FavoriteInsert {
  return {
    user_id: userId,
    food_key: f.key,
    source: f.food.source,
    source_id: f.food.sourceId,
    food_name: f.food.name,
    brand: f.food.brand,
    kcal_per_100g: f.food.per100g.calories,
    protein_per_100g: f.food.per100g.protein,
    carbs_per_100g: f.food.per100g.carbs,
    fat_per_100g: f.food.per100g.fat,
    servings: f.food.servings,
    quantity: f.portion.quantity,
    unit: f.portion.unit,
    serving_label: f.portion.serving?.label ?? null,
    serving_grams: f.portion.serving?.grams ?? null,
    updated_at: f.savedAt,
  };
}
