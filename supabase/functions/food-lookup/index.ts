// Food lookup proxy for the app. Keeps the USDA API key server-side. The upstream calls live in
// ../_shared/food-sources.ts (also used by the MCP server); normalizing and math live in src/lib/.
//
// POST { type: "search", query: string }     -> USDA: { foods: whole foods, branded: branded products }
// POST { type: "search_off", query: string } -> Open Food Facts name search: { products }
// POST { type: "barcode", code: string }     -> Open Food Facts product: { product }
//
// Secrets: FDC_API_KEY (falls back to USDA's heavily rate-limited DEMO_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { offProduct, searchOff, searchUsda, UpstreamError, type FoodSourceConfig } from '../_shared/food-sources.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sources: FoodSourceConfig = {
  fdcApiKey: Deno.env.get('FDC_API_KEY'),
  userAgent: 'MacroTracker/1.0 (personal project; github.com/kentobento2/macro-tracker)',
};

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
      return body.type === 'search'
        ? json(await searchUsda(sources, query))
        : json({ products: await searchOff(sources, query) });
    }
    if (body.type === 'barcode') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^\d{8,14}$/.test(code)) return json({ error: 'invalid_barcode' }, 400);
      return json({ product: await offProduct(sources, code) });
    }
    return json({ error: 'invalid_type' }, 400);
  } catch (e) {
    if (e instanceof UpstreamError && e.busy) return json({ error: 'rate_limited' }, 429);
    if (e instanceof UpstreamError) return json({ error: 'upstream_error', status: e.status }, 502);
    console.error(e);
    return json({ error: 'upstream_error' }, 502);
  }
});
