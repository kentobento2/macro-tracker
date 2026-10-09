// Food lookup proxy. Keeps the USDA API key server-side and trims upstream payloads.
// No nutrition math happens here — the app normalizes and computes in src/lib/.
//
// POST { type: "search", query: string }  -> USDA FoodData Central: { foods: whole foods, branded: branded products }
// POST { type: "search_off", query: string } -> Open Food Facts name search: { products }
// POST { type: "barcode", code: string }  -> Open Food Facts
//
// Secrets: FDC_API_KEY (falls back to USDA's heavily rate-limited DEMO_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const USDA_DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
// Energy (kcal), Atwater energy variants, protein, fat, carbs.
const USDA_NUTRIENT_IDS = new Set([1008, 2047, 2048, 1003, 1004, 1005]);
const OFF_USER_AGENT = 'MacroTracker/1.0 (personal project; github.com/kentobento2/macro-tracker)';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}

// deno-lint-ignore no-explicit-any
function trimUsdaFood(f: any) {
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
      // deno-lint-ignore no-explicit-any
      .filter((n: any) => USDA_NUTRIENT_IDS.has(n.nutrientId))
      // deno-lint-ignore no-explicit-any
      .map((n: any) => ({ nutrientId: n.nutrientId, unitName: n.unitName, value: n.value })),
    foodMeasures: (f.foodMeasures ?? [])
      // deno-lint-ignore no-explicit-any
      .map((m: any) => ({ disseminationText: m.disseminationText, gramWeight: m.gramWeight })),
  };
}

class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`USDA ${status}`);
  }
}

async function usdaSearch(query: string, dataType: string[], pageSize: number, requireAllWords = false) {
  const apiKey = Deno.env.get('FDC_API_KEY') ?? 'DEMO_KEY';
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dataType, pageSize, requireAllWords }),
  });
  if (!res.ok) throw new UpstreamError(res.status);
  const data = await res.json();
  return (data.foods ?? []).map(trimUsdaFood);
}

/**
 * Branded search matches all words first ("quest bar" -> Quest bars, not every candy bar); if that finds
 * fewer than 5 products, top up with any-word matches ("kirkland protein bar" has no all-word hits).
 */
async function searchBranded(query: string) {
  const strict = await usdaSearch(query, ['Branded'], 20, true);
  if (strict.length >= 5) return strict;
  const loose = await usdaSearch(query, ['Branded'], 20, false);
  // deno-lint-ignore no-explicit-any
  const seen = new Set(strict.map((f: any) => f.fdcId));
  // deno-lint-ignore no-explicit-any
  return [...strict, ...loose.filter((f: any) => !seen.has(f.fdcId))].slice(0, 20);
}

/** Whole foods and branded products as separate lists, so branded results don't crowd out basics. */
async function searchUsda(query: string) {
  try {
    const [foods, branded] = await Promise.all([
      usdaSearch(query, USDA_DATA_TYPES, 20),
      searchBranded(query),
    ]);
    return json({ foods, branded });
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 429) return json({ error: 'rate_limited' }, 429);
    if (e instanceof UpstreamError) return json({ error: 'upstream_error', status: e.status }, 502);
    throw e;
  }
}

const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit';

// deno-lint-ignore no-explicit-any
function trimOffProduct(p: any, fallbackCode?: string) {
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

/**
 * Open Food Facts full-text search via search-a-licious (OFF's current search service; the legacy
 * cgi/search.pl endpoint frequently returns 503). Search hits don't include serving sizes, so the app
 * fetches the full product (the barcode lookup below) when one is picked.
 */
async function searchOff(query: string) {
  const params = new URLSearchParams({ q: query, page_size: '20', fields: OFF_FIELDS });
  const res = await fetch(`https://search.openfoodfacts.org/search?${params}`, {
    headers: { 'User-Agent': OFF_USER_AGENT },
  });
  if (res.status === 429 || res.status === 503) return json({ error: 'rate_limited' }, 429);
  if (!res.ok) return json({ error: 'upstream_error', status: res.status }, 502);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  return json({ products: (data.hits ?? []).map((p: any) => trimOffProduct(p)) });
}

async function lookupBarcode(code: string) {
  const fields = OFF_FIELDS;
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${fields}`, {
    headers: { 'User-Agent': OFF_USER_AGENT },
  });
  if (res.status === 404) return json({ product: null });
  if (res.status === 429) return json({ error: 'rate_limited' }, 429);
  if (!res.ok) return json({ error: 'upstream_error', status: res.status }, 502);

  const data = await res.json();
  if (data.status !== 1 || !data.product) return json({ product: null });
  return json({ product: trimOffProduct(data.product, code) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { type?: string; query?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    if (body.type === 'search' || body.type === 'search_off') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (query.length < 1 || query.length > 100) return json({ error: 'invalid_query' }, 400);
      return await (body.type === 'search' ? searchUsda(query) : searchOff(query));
    }
    if (body.type === 'barcode') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^\d{8,14}$/.test(code)) return json({ error: 'invalid_barcode' }, 400);
      return await lookupBarcode(code);
    }
    return json({ error: 'invalid_type' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'upstream_error' }, 502);
  }
});
