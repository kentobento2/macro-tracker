// Calls to the external food databases, shared by the `food-lookup` Edge Function (Deno) and the MCP server
// (Node on Vercel). Runtime-agnostic: no Deno/Node globals, no imports. Keys and fetch are passed in.
// It only fetches and trims upstream payloads; normalizing and all nutrition math live in src/lib/foods.ts.

export type FoodSourceConfig = {
  fdcApiKey?: string; // falls back to USDA's heavily rate-limited DEMO_KEY
  userAgent: string; // Open Food Facts asks clients to identify themselves
  fetch?: typeof fetch;
};

export class UpstreamError extends Error {
  constructor(
    readonly source: 'usda' | 'off',
    readonly status: number
  ) {
    super(`${source} ${status}`);
  }
  /** Busy / rate limited (callers should say "try again shortly"). */
  get busy() {
    return this.status === 429 || this.status === 503;
  }
}

const USDA_WHOLE = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
// Energy (kcal), Atwater energy variants, protein, fat, carbs.
const USDA_NUTRIENT_IDS = new Set([1008, 2047, 2048, 1003, 1004, 1005]);
export const OFF_FIELDS =
  'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit';

// deno-lint-ignore no-explicit-any
type Json = any;

const doFetch = (cfg: FoodSourceConfig) => cfg.fetch ?? fetch;
const usdaKey = (cfg: FoodSourceConfig) => cfg.fdcApiKey || 'DEMO_KEY';

/** USDA food in the search-result shape that src/lib/foods.ts `normalizeUsdaFood` reads. */
export function trimUsdaFood(f: Json) {
  return {
    fdcId: f.fdcId,
    description: f.description,
    dataType: f.dataType,
    brandName: f.brandName || undefined,
    brandOwner: f.brandOwner || undefined,
    servingSize: f.servingSize,
    servingSizeUnit: f.servingSizeUnit,
    householdServingFullText: f.householdServingFullText || undefined,
    foodNutrients: (f.foodNutrients ?? [])
      // Search results: { nutrientId, unitName, value }. Food detail: { nutrient: { id, unitName }, amount }.
      .map((n: Json) =>
        n.nutrient
          ? { nutrientId: n.nutrient.id, unitName: n.nutrient.unitName, value: n.amount }
          : { nutrientId: n.nutrientId, unitName: n.unitName, value: n.value }
      )
      .filter((n: Json) => USDA_NUTRIENT_IDS.has(n.nutrientId)),
    // Search results carry foodMeasures; food detail carries foodPortions.
    foodMeasures: [
      ...(f.foodMeasures ?? []).map((m: Json) => ({ disseminationText: m.disseminationText, gramWeight: m.gramWeight })),
      ...(f.foodPortions ?? []).map((p: Json) => ({
        disseminationText:
          p.portionDescription && p.portionDescription !== 'Quantity not specified'
            ? p.portionDescription
            : [p.amount, p.measureUnit?.name !== 'undetermined' ? p.measureUnit?.name : null, p.modifier]
                .filter(Boolean)
                .join(' '),
        gramWeight: p.gramWeight,
      })),
    ],
  };
}

export type TrimmedUsdaFood = ReturnType<typeof trimUsdaFood>;

async function usdaSearchRaw(
  cfg: FoodSourceConfig,
  query: string,
  dataType: string[],
  pageSize: number,
  requireAllWords = false
): Promise<TrimmedUsdaFood[]> {
  const res = await doFetch(cfg)(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaKey(cfg)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dataType, pageSize, requireAllWords }),
  });
  if (!res.ok) throw new UpstreamError('usda', res.status);
  const data = await res.json();
  return (data.foods ?? []).map(trimUsdaFood);
}

/**
 * Branded search matches all words first ("quest bar" -> Quest bars, not every candy bar); if that finds
 * fewer than 5 products, top up with any-word matches ("kirkland protein bar" has no all-word hits).
 */
async function searchBranded(cfg: FoodSourceConfig, query: string) {
  const strict = await usdaSearchRaw(cfg, query, ['Branded'], 20, true);
  if (strict.length >= 5) return strict;
  const loose = await usdaSearchRaw(cfg, query, ['Branded'], 20, false);
  const seen = new Set(strict.map((f) => f.fdcId));
  return [...strict, ...loose.filter((f) => !seen.has(f.fdcId))].slice(0, 20);
}

/** Whole foods and branded products as separate lists, so branded results don't crowd out basics. */
export async function searchUsda(cfg: FoodSourceConfig, query: string) {
  const [foods, branded] = await Promise.all([usdaSearchRaw(cfg, query, USDA_WHOLE, 20), searchBranded(cfg, query)]);
  return { foods, branded };
}

/** One USDA food by FDC id (any data type), or null if it doesn't exist. */
export async function usdaFoodById(cfg: FoodSourceConfig, fdcId: number): Promise<TrimmedUsdaFood | null> {
  const res = await doFetch(cfg)(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${usdaKey(cfg)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new UpstreamError('usda', res.status);
  return trimUsdaFood(await res.json());
}

export function trimOffProduct(p: Json, fallbackCode?: string) {
  const n = p.nutriments ?? {};
  return {
    code: p.code ?? fallbackCode,
    product_name: p.product_name,
    product_name_en: p.product_name_en,
    // The product API returns a comma-separated string; the search API returns an array.
    brands: Array.isArray(p.brands) ? p.brands.join(', ') : p.brands,
    serving_size: p.serving_size,
    serving_quantity: p.serving_quantity,
    serving_quantity_unit: p.serving_quantity_unit,
    nutriments: {
      'energy-kcal_100g': n['energy-kcal_100g'],
      'energy-kj_100g': n['energy-kj_100g'],
      proteins_100g: n.proteins_100g,
      carbohydrates_100g: n.carbohydrates_100g,
      fat_100g: n.fat_100g,
    },
  };
}

export type TrimmedOffProduct = ReturnType<typeof trimOffProduct>;

/**
 * Open Food Facts full-text search via search-a-licious (OFF's current search service; the legacy
 * cgi/search.pl endpoint frequently returns 503). Hits don't include serving sizes; use `offProduct` for those.
 */
export async function searchOff(cfg: FoodSourceConfig, query: string): Promise<TrimmedOffProduct[]> {
  const params = new URLSearchParams({ q: query, page_size: '20', fields: OFF_FIELDS });
  const res = await doFetch(cfg)(`https://search.openfoodfacts.org/search?${params}`, {
    headers: { 'User-Agent': cfg.userAgent },
  });
  if (!res.ok) throw new UpstreamError('off', res.status);
  const data = await res.json();
  return (data.hits ?? []).map((p: Json) => trimOffProduct(p));
}

/** One Open Food Facts product by barcode, or null if unknown. */
export async function offProduct(cfg: FoodSourceConfig, code: string): Promise<TrimmedOffProduct | null> {
  const res = await doFetch(cfg)(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${OFF_FIELDS}`, {
    headers: { 'User-Agent': cfg.userAgent },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new UpstreamError('off', res.status);
  const data = await res.json();
  return data.status === 1 && data.product ? trimOffProduct(data.product, code) : null;
}
