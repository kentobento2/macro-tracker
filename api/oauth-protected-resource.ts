// OAuth Protected Resource Metadata (RFC 9728) for the MCP server: tells clients such as Claude that
// Supabase Auth is the authorization server. Served at /.well-known/oauth-protected-resource[/api/mcp].
import { protectedResourceMetadata } from '../src/server/mcp';

export function GET(req: Request) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  return Response.json(protectedResourceMetadata(new URL(req.url).origin, supabaseUrl), {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
  });
}
