// Food lookup proxy. Keeps the USDA API key server-side and trims upstream payloads.
// No nutrition math happens here — the app normalizes and computes in src/lib/.
//
// POST { type: "search", query: string }  -> USDA FoodData Central: { foods: whole foods, branded: branded products }
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

async function usdaSearch(query: string, dataType: string[], pageSize: number) {
  const apiKey = Deno.env.get('FDC_API_KEY') ?? 'DEMO_KEY';
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dataType, pageSize }),
  });
  if (!res.ok) throw new UpstreamError(res.status);
  const data = await res.json();
  return (data.foods ?? []).map(trimUsdaFood);
}

/** Whole foods and branded products as separate lists, so branded results don't crowd out basics. */
async function searchUsda(query: string) {
  try {
    const [foods, branded] = await Promise.all([
      usdaSearch(query, USDA_DATA_TYPES, 20),
      usdaSearch(query, ['Branded'], 20),
    ]);
    return json({ foods, branded });
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 429) return json({ error: 'rate_limited' }, 429);
    if (e instanceof UpstreamError) return json({ error: 'upstream_error', status: e.status }, 502);
    throw e;
  }
}

async function lookupBarcode(code: string) {
  const fields = 'code,product_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${fields}`, {
    headers: { 'User-Agent': OFF_USER_AGENT },
  });
  if (res.status === 404) return json({ product: null });
  if (res.status === 429) return json({ error: 'rate_limited' }, 429);
  if (!res.ok) return json({ error: 'upstream_error', status: res.status }, 502);

  const data = await res.json();
  if (data.status !== 1 || !data.product) return json({ product: null });
  const p = data.product;
  const n = p.nutriments ?? {};
  return json({
    product: {
      code: p.code ?? code,
      product_name: p.product_name,
      brands: p.brands,
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
    },
  });
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
    if (body.type === 'search') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (query.length < 1 || query.length > 100) return json({ error: 'invalid_query' }, 400);
      return await searchUsda(query);
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
