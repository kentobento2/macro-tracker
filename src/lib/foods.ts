// Normalizes USDA FoodData Central and Open Food Facts records into one FoodItem shape. Pure.

import { caloriesFromMacros, type Nutrition } from './macros';
import type { Serving } from './units';

export type FoodSource = 'usda' | 'off' | 'custom';

export type FoodItem = {
  source: FoodSource;
  sourceId: string | null;
  name: string;
  brand: string | null;
  per100g: Nutrition;
  servings: Serving[];
  /** True when calories weren't in the source and were computed from macros (4/4/9). */
  caloriesDerived: boolean;
};

const KJ_PER_KCAL = 4.184;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Pick calories from the source if present, otherwise derive from macros. */
function resolveCalories(kcal: number | null, macros: Omit<Nutrition, 'calories'>) {
  return kcal !== null
    ? { calories: kcal, caloriesDerived: false }
    : { calories: caloriesFromMacros(macros), caloriesDerived: true };
}

// ---------- USDA FoodData Central ----------

export type UsdaFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  foodNutrients?: { nutrientId: number; unitName?: string; value?: number }[];
  foodMeasures?: { disseminationText?: string; gramWeight?: number }[];
};

const USDA = {
  energy: 1008,
  energyAtwaterGeneral: 2047,
  energyAtwaterSpecific: 2048,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
} as const;

/** USDA search results for Foundation / SR Legacy / Survey foods report nutrients per 100 g. */
export function normalizeUsdaFood(f: UsdaFood): FoodItem | null {
  const nutrients = f.foodNutrients ?? [];
  const get = (id: number, unit?: string) => {
    const n = nutrients.find((x) => x.nutrientId === id && (!unit || x.unitName?.toUpperCase() === unit));
    return num(n?.value);
  };

  const protein = get(USDA.protein) ?? 0;
  const fat = get(USDA.fat) ?? 0;
  const carbs = get(USDA.carbs) ?? 0;
  const kcal =
    get(USDA.energy, 'KCAL') ?? get(USDA.energyAtwaterSpecific, 'KCAL') ?? get(USDA.energyAtwaterGeneral, 'KCAL');

  if (kcal === null && protein === 0 && fat === 0 && carbs === 0) return null;

  const seen = new Set<string>();
  const servings: Serving[] = [];
  for (const m of f.foodMeasures ?? []) {
    const grams = num(m.gramWeight);
    const label = m.disseminationText?.trim();
    if (!grams || !label || label.toLowerCase() === 'quantity not specified' || seen.has(label)) continue;
    seen.add(label);
    servings.push({ label, grams });
  }

  const { calories, caloriesDerived } = resolveCalories(kcal, { protein, fat, carbs });
  return {
    source: 'usda',
    sourceId: String(f.fdcId),
    name: f.description.trim(),
    brand: null,
    per100g: { calories, protein, carbs, fat },
    servings,
    caloriesDerived,
  };
}

// ---------- Open Food Facts ----------

export type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  nutriments?: Record<string, number | string | undefined>;
};

/** Open Food Facts `*_100g` fields are per 100 g (or 100 ml for drinks, treated as 100 g). */
export function normalizeOffProduct(p: OffProduct, fallbackCode: string): FoodItem | null {
  const n = p.nutriments ?? {};
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  const kj = num(n['energy-kj_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== null ? kj / KJ_PER_KCAL : null);

  if (kcal === null && protein === null && carbs === null && fat === null) return null;

  const macros = { protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  const { calories, caloriesDerived } = resolveCalories(kcal, macros);

  const servings: Serving[] = [];
  const servingGrams = num(p.serving_quantity);
  const servingUnit = (p.serving_quantity_unit ?? 'g').toLowerCase();
  if (servingGrams && (servingUnit === 'g' || servingUnit === 'ml')) {
    servings.push({ label: p.serving_size?.trim() || `1 serving (${servingGrams} g)`, grams: servingGrams });
  }

  const brand = p.brands?.split(',')[0]?.trim() || null;
  return {
    source: 'off',
    sourceId: p.code ?? fallbackCode,
    name: p.product_name?.trim() || 'Unnamed product',
    brand,
    per100g: { ...macros, calories },
    servings,
    caloriesDerived,
  };
}

/** Stable identity for a food across logs and favorites: "usda:2709224", "off:0737…", or "name:banana". */
export function foodKey(food: Pick<FoodItem, 'source' | 'sourceId' | 'name'>): string {
  return food.sourceId ? `${food.source}:${food.sourceId}` : `name:${food.name.trim().toLowerCase()}`;
}
