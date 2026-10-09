-- Support for the MCP server (AI assistants logging meals).

-- 1) Each user's timezone, used by the assistants for "today" and meal dates.
alter table public.profiles
  add column timezone text not null default 'Pacific/Honolulu'
  check (char_length(timezone) between 1 and 64);

-- 2) Personal access tokens for assistants that can't do OAuth (e.g. Meta Muse).
--    Only a SHA-256 hash of the token is stored; the token itself is shown to the user once.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (char_length(token_prefix) between 4 and 16),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_tokens_user_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;

create policy "api_tokens: owner can select" on public.api_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "api_tokens: owner can insert" on public.api_tokens
  for insert to authenticated with check (user_id = (select auth.uid()) and revoked_at is null);
create policy "api_tokens: owner can revoke" on public.api_tokens
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "api_tokens: owner can delete" on public.api_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- Users may only change a token's name or revoke it, never its hash or owner.
revoke update on public.api_tokens from authenticated;
grant update (name, revoked_at) on public.api_tokens to authenticated;

-- 3) Per-user rate limiting for the MCP server: a fixed one-minute window counter.
create table private.mcp_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, window_start)
);
revoke all on private.mcp_rate_limits from public, anon, authenticated;

-- Counts one request and returns true if the user is still within `p_limit` requests this minute.
-- Only the server (service role) may call it.
create function public.mcp_rate_hit(p_user_id uuid, p_limit integer) returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  w timestamptz := date_trunc('minute', now());
  n integer;
begin
  insert into private.mcp_rate_limits as r (user_id, window_start, hits)
  values (p_user_id, w, 1)
  on conflict (user_id, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  -- Keep the table small: drop this user's windows older than an hour.
  delete from private.mcp_rate_limits where user_id = p_user_id and window_start < w - interval '1 hour';
  return n <= p_limit;
end;
$$;

revoke all on function public.mcp_rate_hit(uuid, integer) from public, anon, authenticated;
grant execute on function public.mcp_rate_hit(uuid, integer) to service_role;
