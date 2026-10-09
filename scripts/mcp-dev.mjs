// Local MCP server for development and MCP Inspector: the same handler Vercel runs at /api/mcp.
// Usage: npm run mcp:dev   (reads .env and .env.local; needs SUPABASE_SECRET_KEY in .env.local)
import { createServer } from 'node:http';

import { handleMcpRequest, protectedResourceMetadata } from '../src/server/mcp.ts';

const PORT = Number(process.env.PORT ?? 8787);
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL (in .env) and SUPABASE_SECRET_KEY (in .env.local) first.');
  process.exit(1);
}

const env = {
  supabaseUrl,
  supabaseSecretKey,
  sources: { fdcApiKey: process.env.FDC_API_KEY, userAgent: 'MacroTracker/1.0 (local dev)' },
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  let response;
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    response = Response.json(protectedResourceMetadata(url.origin, supabaseUrl));
  } else if (url.pathname === '/api/mcp') {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    response = await handleMcpRequest(new Request(url, { method: req.method, headers, body }), env);
  } else {
    response = new Response('Not found', { status: 404 });
  }

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`MCP server: http://localhost:${PORT}/api/mcp`));
