# Macro Tracker MCP server

A remote MCP server that lets Claude and Meta Muse log meals and weigh-ins into your own Macro Tracker account.

- **URL:** `https://macro-tracker-rho-two.vercel.app/api/mcp` (Streamable HTTP, stateless, JSON responses)
- **Code:** `api/mcp.ts` (Vercel Function) → `src/server/` (auth, per-user store, tools). Food data comes from `supabase/functions/_shared/food-sources.ts`, the same code the app's `food-lookup` Edge Function uses.
- **Auth:** every request needs `Authorization: Bearer <token>`. The token is either
  - a **Supabase OAuth access token**, which Claude gets by signing you in through `/oauth/consent`, or
  - a **personal API token** (`mt_…`) from Settings → Assistant access, for assistants that take a bearer token (Meta Muse).
  
  The server derives the user from the token. No tool accepts a user id, and every database query is filtered to that user.
- **Timezone:** "today" for assistants uses `profiles.timezone` (default `Pacific/Honolulu`).
- **Limits:** 60 requests per minute per user (if the limiter itself is unreachable, requests are refused with 503 rather than let through). Logs record the tool name, status, timing and a hashed user fingerprint, never food text or tokens.

## Tools

| Tool | What it does | Annotations |
| --- | --- | --- |
| `preview_meal` | Matches parsed items to foods and computes macros. Writes nothing. | read-only |
| `log_meal` | Logs confirmed items (from `preview_meal`) to a day and meal. All or nothing. | write |
| `search_foods` | Searches your saved foods (custom foods first), then USDA and Open Food Facts. | read-only |
| `get_recent_foods` | Your custom foods, favorites and recently logged foods with their usual portions. | read-only |
| `create_custom_food` | Saves a food you describe with its nutrition per serving (label, menu, recipe). Same name = update. | write, idempotent |
| `get_daily_summary` | A day's entries, totals vs. targets, and remaining amounts. | read-only |
| `update_log_entry` | Changes an entry's amount, food or meal. | write, idempotent |
| `delete_log_entry` | Deletes one entry. The assistant is told to confirm first. | destructive |
| `log_weight` | Records a weigh-in (lb or kg). One per day; replaces that day's value. | write, idempotent |
| `get_weight_trend` | Weekly averages, change, and 7-day rolling average. | read-only |

## One-time setup

### Supabase (dashboard)
1. **Authentication → OAuth Server:** enable it, set the authorization path to `/oauth/consent`, and turn on **Allow dynamic client registration**.
2. **Authentication → URL Configuration → Redirect URLs:** make sure `https://macro-tracker-rho-two.vercel.app/**` is listed.
3. Apply the migration that adds `profiles.timezone`, `api_tokens` and the rate limiter.

### Vercel (Project → Settings → Environment Variables)
| Key | Value | Environments |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_…`) | Production, Preview (Sensitive) |
| `FDC_API_KEY` | USDA FoodData Central key | Production, Preview (Sensitive) |

`EXPO_PUBLIC_SUPABASE_URL` is already set and used for the server URL too.

## Connect Claude
1. Claude (web or desktop) → **Settings → Connectors → Add custom connector**.
2. Name: `Macro Tracker`. URL: `https://macro-tracker-rho-two.vercel.app/api/mcp`.
3. Leave the OAuth client ID/secret empty (Claude registers itself automatically). Click **Add**, then **Connect**.
4. A Macro Tracker page opens. Sign in with Google if asked, check that it says you're signed in as *your* email, then tap **Allow**.
5. In a chat, enable the connector from the tools menu and try: *"I had 2 eggs and a slice of toast for breakfast."*

Each person connects with their own Google account. To disconnect, remove the connector in Claude.

## Connect Meta Muse
1. In Macro Tracker: **Settings → Assistant access**. Name the token (e.g. `Meta Muse`), tap **Create token**, and copy it. It is shown only once.
2. In Muse, ask it to add a custom MCP connector with URL `https://macro-tracker-rho-two.vercel.app/api/mcp` and **Bearer token** authentication. Paste the token only into the secure credential prompt, never into the chat itself.
3. Try: *"Log a banana as a snack."*

If a token leaks or you stop using it, tap **Revoke** in Settings. It stops working immediately. Tokens also expire 90 days after they are created; Settings shows the date. When one expires, create a new token and update it in Muse.

## Test with MCP Inspector
Get a token: create an API token in Settings, or use your own.

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector UI:
- **Transport:** Streamable HTTP
- **URL:** `https://macro-tracker-rho-two.vercel.app/api/mcp` (or `http://localhost:8787/api/mcp` locally)
- **Authentication:** header `Authorization`, value `Bearer mt_…`

Then **Connect → Tools → List Tools**.

For a local server, put `SUPABASE_SECRET_KEY=…` (and optionally `FDC_API_KEY=…`) in `.env.local` (gitignored) and run:

```bash
npm run mcp:dev
```

Quick checks with curl:

```bash
curl -i -X POST https://macro-tracker-rho-two.vercel.app/api/mcp -H "Content-Type: application/json" -d "{}"
```
Expect `401` with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`.

```bash
curl https://macro-tracker-rho-two.vercel.app/.well-known/oauth-protected-resource/api/mcp
```
Expect JSON naming `…supabase.co/auth/v1` as the authorization server.

## Manual test script
Run as each user, in Claude and in Muse. Check every step in the app.

1. **Preview, no write:** "I had 2 eggs and a slice of whole wheat toast for breakfast." The assistant shows matches and macros and asks before logging. Nothing appears in the app yet.
2. **Log:** "Yes, log it." The entries appear in today's Breakfast with the same macros the assistant showed.
3. **Units:** "Add 1.5 cups of cooked white rice and 6 oz grilled chicken breast to lunch." Grams in the app match (6 oz ≈ 170 g).
4. **Unknown unit:** "Log a handful of almonds." The assistant asks for an amount it can convert (grams, oz, or pieces).
5. **Not found:** "Log a zorblax bar." The assistant says it couldn't find it and logs nothing.
6. **Summary:** "How am I doing today?" The totals and remaining amounts match the Log tab.
7. **Edit:** "Change the rice to 1 cup." The entry updates and the totals drop.
8. **Delete:** "Delete the toast." The assistant confirms first. After you say yes, the entry is gone.
9. **Another day:** "Log oatmeal for yesterday's breakfast." It shows on yesterday's date.
10. **Weight:** "I weighed 172.4 lb this morning." It appears in the Weight tab. Then: "How's my weight trending?"
11. **Isolation:** with your fiancée's connection, ask "What did I eat today?" You must see only her entries, never yours.
12. **Revoke:** revoke the Muse token in Settings, then ask Muse anything. It should fail with an authorization error.
13. **Custom food:** "My poke bowl from Ono is 750 calories, 40 g protein, 70 g carbs, 15 g fat. Save it and log one for lunch." The assistant confirms the numbers, saves it, and logs "1 bowl". It appears under My foods in Add food, and the entry shows no gram weight.
14. **Timezone:** around midnight Honolulu time, "today" follows Honolulu time, not UTC.
