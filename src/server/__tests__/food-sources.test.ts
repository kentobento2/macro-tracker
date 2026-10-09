import {
  offProduct,
  searchOff,
  searchUsda,
  trimUsdaFood,
  UpstreamError,
  usdaFoodById,
  type FoodSourceConfig,
} from '../../../supabase/functions/_shared/food-sources';
import { apiTokenDisplayPrefix, formatApiToken, isApiToken } from '../../lib/api-tokens';
import { normalizeUsdaFood } from '../../lib/foods';
import { sha256Hex } from '../auth';

type Call = { url: string; body?: any };

function mockFetch(handler: (url: string, body: any) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const r = handler(url, body);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { calls, cfg: { fdcApiKey: 'KEY', userAgent: 'test-agent', fetch: fetchFn } as FoodSourceConfig };
}

const usdaHit = (fdcId: number) => ({
  fdcId,
  description: `Food ${fdcId}`,
  dataType: 'Branded',
  foodNutrients: [{ nutrientId: 1008, unitName: 'KCAL', value: 100 }, { nutrientId: 1093, unitName: 'MG', value: 5 }],
});

describe('searchUsda', () => {
  it('searches whole foods and branded separately with the API key', async () => {
    const { calls, cfg } = mockFetch(() => ({ json: { foods: [1, 2, 3, 4, 5].map(usdaHit) } }));
    const r = await searchUsda(cfg, 'quest bar');
    expect(r.foods).toHaveLength(5);
    expect(r.branded).toHaveLength(5);
    expect(calls.every((c) => c.url.includes('api_key=KEY'))).toBe(true);
    expect(calls.map((c) => c.body.dataType)).toEqual([['Foundation', 'SR Legacy', 'Survey (FNDDS)'], ['Branded']]);
    expect(calls[1].body.requireAllWords).toBe(true);
    // Only the nutrients the app uses are kept.
    expect(r.foods[0].foodNutrients).toEqual([{ nutrientId: 1008, unitName: 'KCAL', value: 100 }]);
  });

  it('tops up sparse all-words branded results with any-word matches, without duplicates', async () => {
    const { calls, cfg } = mockFetch((_u, body) => ({
      json: { foods: body.dataType[0] === 'Branded' ? (body.requireAllWords ? [usdaHit(1)] : [usdaHit(1), usdaHit(2)]) : [] },
    }));
    const r = await searchUsda(cfg, 'kirkland protein bar');
    expect(r.branded.map((f) => f.fdcId)).toEqual([1, 2]);
    expect(calls.filter((c) => c.body.dataType[0] === 'Branded').map((c) => c.body.requireAllWords)).toEqual([true, false]);
  });

  it('reports busy upstreams', async () => {
    const { cfg } = mockFetch(() => ({ status: 429 }));
    await expect(searchUsda(cfg, 'x')).rejects.toMatchObject({ source: 'usda', status: 429, busy: true });
  });
});

describe('usdaFoodById (food detail shape)', () => {
  it('maps detail nutrients and portions into the shape the app parses', async () => {
    // Shape per FoodData Central's /food/{fdcId} documentation.
    const detail = {
      fdcId: 173944,
      description: 'Bananas, raw',
      dataType: 'SR Legacy',
      foodNutrients: [
        { nutrient: { id: 1008, unitName: 'kcal' }, amount: 89 },
        { nutrient: { id: 1003, unitName: 'g' }, amount: 1.09 },
        { nutrient: { id: 1005, unitName: 'g' }, amount: 22.84 },
        { nutrient: { id: 1004, unitName: 'g' }, amount: 0.33 },
        { nutrient: { id: 1079, unitName: 'g' }, amount: 2.6 },
      ],
      foodPortions: [
        { amount: 1, modifier: 'cup, mashed', measureUnit: { name: 'undetermined' }, gramWeight: 225 },
        { portionDescription: '1 medium (7" to 7-7/8" long)', gramWeight: 118 },
        { portionDescription: 'Quantity not specified', amount: 1, modifier: 'banana', measureUnit: { name: 'undetermined' }, gramWeight: 118 },
      ],
    };
    const { calls, cfg } = mockFetch(() => ({ json: detail }));
    const trimmed = await usdaFoodById(cfg, 173944);
    expect(calls[0].url).toContain('/fdc/v1/food/173944?api_key=KEY');
    const food = normalizeUsdaFood(trimmed!)!;
    expect(food.per100g).toEqual({ calories: 89, protein: 1.09, carbs: 22.84, fat: 0.33 });
    expect(food.servings).toEqual([
      { label: '1 cup, mashed', grams: 225 },
      { label: '1 medium (7" to 7-7/8" long)', grams: 118 },
      { label: '1 banana', grams: 118 },
    ]);
  });

  it('returns null for unknown ids', async () => {
    const { cfg } = mockFetch(() => ({ status: 404 }));
    expect(await usdaFoodById(cfg, 1)).toBeNull();
  });

  it('keeps search-shaped records unchanged', () => {
    expect(trimUsdaFood({ fdcId: 1, description: 'x', foodNutrients: [{ nutrientId: 1003, unitName: 'G', value: 2 }], foodMeasures: [{ disseminationText: '1 cup', gramWeight: 150 }] })).toMatchObject({
      foodNutrients: [{ nutrientId: 1003, unitName: 'G', value: 2 }],
      foodMeasures: [{ disseminationText: '1 cup', gramWeight: 150 }],
    });
  });
});

describe('Open Food Facts', () => {
  it('searches with the user agent and joins brand arrays', async () => {
    const { calls, cfg } = mockFetch(() => ({ json: { hits: [{ code: '0888849044634', product_name: 'Quest bar', brands: ['Quest', 'Quest Nutrition'], nutriments: { 'energy-kcal_100g': 300 } }] } }));
    const r = await searchOff(cfg, 'quest bar');
    expect(calls[0].url).toContain('search.openfoodfacts.org/search?q=quest+bar');
    expect(r[0].brands).toBe('Quest, Quest Nutrition');
  });

  it('treats 503 as busy and missing products as null', async () => {
    await expect(searchOff(mockFetch(() => ({ status: 503 })).cfg, 'x')).rejects.toBeInstanceOf(UpstreamError);
    expect(await offProduct(mockFetch(() => ({ status: 404 })).cfg, '12345678')).toBeNull();
    expect(await offProduct(mockFetch(() => ({ json: { status: 0 } })).cfg, '12345678')).toBeNull();
  });
});

describe('API tokens', () => {
  it('formats 32 random bytes as mt_ + 43 url-safe characters', () => {
    const t = formatApiToken(new Uint8Array(32).fill(255));
    expect(t).toMatch(/^mt_[A-Za-z0-9_-]{43}$/);
    expect(isApiToken(t)).toBe(true);
    expect(isApiToken('mt_short')).toBe(false);
    expect(isApiToken('eyJhbGciOi.jwt.token')).toBe(false);
    expect(apiTokenDisplayPrefix(t)).toBe(t.slice(0, 7));
    expect(() => formatApiToken(new Uint8Array(16))).toThrow(RangeError);
  });

  it('hashes with SHA-256 hex (matches the app and the database check)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
