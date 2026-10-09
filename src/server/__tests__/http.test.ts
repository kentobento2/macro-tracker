import { formatApiToken } from '../../lib/api-tokens';
import { sha256Hex } from '../auth';
import type { FoodLookup } from '../foods';
import { handleMcpRequest, protectedResourceMetadata, type ServerEnv } from '../mcp';
import type { Db } from '../store';
import { createFakeDb, fakeClient, type FakeDb } from '../testing/fake-supabase';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const URL_ = 'https://macro.example/api/mcp';
const TOKEN = formatApiToken(new Uint8Array(32).fill(7));
// Shaped like a JWT; the fake Supabase Auth maps it to user A.
const OAUTH_A = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJhIn0.c2lnbmF0dXJl';

let db: FakeDb;
const noFoods: FoodLookup = {
  searchExternal: async () => ({ usda: [], off: [], problems: [] }),
  searchOff: async () => ({ foods: [] }),
  fetchByRef: async () => null,
};
const env = (): ServerEnv => ({
  supabaseUrl: 'https://proj.supabase.co',
  supabaseSecretKey: 'unused-in-tests',
  sources: { userAgent: 'test' },
  makeDb: () => fakeClient(db) as unknown as Db,
  makeFoods: () => noFoods,
});

const rpc = (method: string, params: unknown, auth: string | null = `Bearer ${TOKEN}`) =>
  handleMcpRequest(
    new Request(URL_, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Mcp-Protocol-Version': '2025-06-18',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
    env()
  );

// Request logs are exercised but not printed.
beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

beforeEach(async () => {
  db = createFakeDb({
    tables: {
      api_tokens: [{ id: 't1', user_id: A, name: 'Muse', token_hash: await sha256Hex(TOKEN), token_prefix: 'mt_BwcH', created_at: new Date().toISOString(), revoked_at: null, last_used_at: null }],
      profiles: [{ id: A, unit_system: 'imperial', timezone: 'Pacific/Honolulu', target_calories: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 67 }],
    },
    sessions: { [OAUTH_A]: A },
  });
});

describe('MCP over HTTP', () => {
  it('rejects unauthenticated requests with an OAuth discovery challenge', async () => {
    const res = await rpc('tools/list', {}, null);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://macro.example/.well-known/oauth-protected-resource/api/mcp"'
    );
  });

  it('rejects unknown, malformed and revoked API tokens', async () => {
    expect((await rpc('tools/list', {}, `Bearer ${formatApiToken(new Uint8Array(32).fill(9))}`)).status).toBe(401);
    expect((await rpc('tools/list', {}, 'Bearer mt_short')).status).toBe(401);
    db.tables.api_tokens[0].revoked_at = '2026-10-01T00:00:00Z';
    expect((await rpc('tools/list', {})).status).toBe(401);
  });

  it('initializes and lists all nine tools with annotations', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe('macro-tracker');

    const res = await rpc('tools/list', {});
    const tools = (await res.json()).result.tools as { name: string; annotations: Record<string, unknown>; inputSchema: { properties: object } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['delete_log_entry', 'get_daily_summary', 'get_recent_foods', 'get_weight_trend', 'log_meal', 'log_weight', 'preview_meal', 'search_foods', 'update_log_entry'].sort()
    );
    expect(tools.find((t) => t.name === 'delete_log_entry')!.annotations).toMatchObject({ destructiveHint: true });
    expect(tools.find((t) => t.name === 'preview_meal')!.annotations).toMatchObject({ readOnlyHint: true });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('runs a tool for the token owner and records last use', async () => {
    const res = await rpc('tools/call', { name: 'get_daily_summary', arguments: {} });
    const body = await res.json();
    expect(body.result.isError).toBeFalsy();
    const summary = JSON.parse(body.result.content[0].text);
    expect(summary.targets.calories).toBe(2000);
    expect(db.tables.api_tokens[0].last_used_at).not.toBeNull();
  });

  it('accepts Supabase OAuth access tokens', async () => {
    const res = await rpc('tools/call', { name: 'get_daily_summary', arguments: {} }, `Bearer ${OAUTH_A}`);
    expect(res.status).toBe(200);
    expect((await res.json()).result.isError).toBeFalsy();
  });

  it('rejects API tokens past their 90-day lifetime', async () => {
    db.tables.api_tokens[0].created_at = new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString();
    expect((await rpc('tools/list', {})).status).toBe(401);
  });

  it('rejects junk bearer values without calling Supabase Auth', async () => {
    for (const junk of ['Bearer hello', `Bearer ${'a'.repeat(5000)}.b.c`, 'Bearer a.b', 'Basic abc']) {
      expect((await rpc('tools/list', {}, junk)).status).toBe(401);
    }
    expect(db.getUserCalls).toBe(0);
  });

  it('refuses requests when the rate limiter is unavailable (fails closed)', async () => {
    db.rateLimitAllows = 'error';
    const res = await rpc('tools/call', { name: 'get_daily_summary', arguments: {} });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('returns invalid arguments as a tool error, not a crash', async () => {
    const res = await rpc('tools/call', { name: 'log_weight', arguments: { weight: -5, unit: 'lb' } });
    const body = await res.json();
    expect(body.result?.isError ?? body.error).toBeTruthy();
  });

  it('rate limits', async () => {
    db.rateLimitAllows = false;
    const res = await rpc('tools/list', {});
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('allows CORS preflight and refuses GET (stateless server)', async () => {
    const pre = await handleMcpRequest(new Request(URL_, { method: 'OPTIONS' }), env());
    expect(pre.status).toBe(204);
    const get = await handleMcpRequest(new Request(URL_, { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } }), env());
    expect(get.status).toBe(405);
  });
});

describe('protected resource metadata', () => {
  it('points clients at Supabase Auth', () => {
    expect(protectedResourceMetadata('https://macro.example', 'https://proj.supabase.co')).toEqual({
      resource: 'https://macro.example/api/mcp',
      authorization_servers: ['https://proj.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
      resource_name: 'Macro Tracker',
    });
  });
});
