// Vercel Function: the remote MCP server (Streamable HTTP) at /api/mcp.
import { handleMcpRequest, type ServerEnv } from '../src/server/mcp';

function env(): ServerEnv {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set.');
  return {
    supabaseUrl,
    supabaseSecretKey,
    sources: {
      fdcApiKey: process.env.FDC_API_KEY,
      userAgent: 'MacroTracker/1.0 (personal project; github.com/kentobento2/macro-tracker)',
    },
  };
}

const handle = (req: Request) => handleMcpRequest(req, env());

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
