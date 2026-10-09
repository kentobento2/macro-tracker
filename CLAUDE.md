# Macro Tracker

Expo (TypeScript, Expo Router) app shipped primarily as a mobile-first PWA on web, backed by Supabase. Product requirements live in `SPEC.md`.

@AGENTS.md

## Project rules

### Macro math lives in its own tested module
- All nutrition math lives in pure modules under `src/lib/`: `macros.ts` (totals, scaling), `units.ts` (g/oz/servings, lb/ft), `targets.ts` (BMR/TDEE/macro targets), `entries.ts` (entry totals, weekly averages), `foods.ts` (normalizing USDA / Open Food Facts), `settings-form.ts` (form parsing and unit conversion), `dates.ts` / `calendar.ts` (date keys, Mon–Sun weeks, month grids), `bodyweight.ts` (weekly/rolling averages, week-over-week, ranges, weight queue; weights are canonical kg).
- These modules stay pure: no React, no Supabase, no I/O, no `Date.now()`. Inputs in, numbers out.
- Screens and components call into them; they never inline macro arithmetic. The Edge Function only proxies and trims data — no math there.
- Macro math is done in code, never estimated by AI. Missing calories are derived from macros (4/4/9) and flagged in the UI.
- Every new or changed function gets tests in `src/lib/__tests__/`. Run `npm test` and make sure it passes before declaring work done.

### Never commit secrets
- `.env` is gitignored and must stay that way. Put new config keys in `.env.example` with placeholder values.
- Client code may only use `EXPO_PUBLIC_*` variables, and those are bundled into the public app. Only the Supabase **anon/publishable** key belongs there.
- Never add the Supabase `service_role`/secret key, database passwords, the USDA API key, or any other private credential to this repo or to `EXPO_PUBLIC_*` vars. Server-side keys go in Supabase Edge Function secrets.
- Security is enforced with Row Level Security in Supabase, not by hiding the anon key. The GitHub repo is public.
- Before committing, check `git status` / `git diff --staged` for keys or tokens.

### Mobile-first UI
- Design for a ~375px-wide phone screen first; larger screens get a centered column (max ~520px), not a desktop layout.
- Touch targets at least 44×44pt; primary actions reachable with a thumb.
- Inputs use 16px text so iOS Safari doesn't zoom on focus.
- Respect safe areas (`react-native-safe-area-context`), support light and dark mode (colors in `src/constants/theme.ts`).
- Use React Native primitives so screens work on web and native; keep web-only code in `.web.tsx` files or behind `Platform.OS === 'web'`.
- Must work on iPhone Safari and Android Chrome, including installed to the home screen. Check changes at phone width (`npm run web`, devtools device mode).

## Layout
- `src/app/` — Expo Router routes only. `(tabs)/` = Log (any day via `?date=`: arrows, Today chip, tap the date for a month calendar with dots on logged days; plus that week's Mon–Sun average), Weight (weigh-ins, weekly average + change, history by week) and Settings; `add.tsx` = add/edit food (modal); `sign-in.tsx`; `+html.tsx` = web HTML shell with PWA meta tags.
- `src/lib/` — pure logic (above), plus `supabase.ts` (the single client), `rows.ts` (DB row ↔ app type mapping), `sync.ts` (pure offline queue/cache logic), `database.types.ts` (generated; regenerate after migrations).
- `src/data/` — I/O: auth, offline-first stores (`entries-store.ts`, `profile-store.ts`, `weight-store.ts`), the food API client, and React hooks in `data-provider.tsx`.
- `src/components/` — UI. `ui.tsx` has the shared primitives; `barcode-scanner.web.tsx` is the camera scanner (web only).
- `supabase/migrations/` — schema history. Every table has RLS restricting rows to their owner; keep it that way.
- `supabase/functions/food-lookup/` — Edge Function proxying USDA FoodData Central (search) and Open Food Facts (barcodes). Reads the `FDC_API_KEY` secret. Deno code, excluded from the app's tsconfig/eslint.
- `public/` — static web files: `manifest.json`, `sw.js`, icons.

## Offline model
- Writes go to a persisted local queue first and show immediately; the queue drains to Supabase when online. Network, auth-expiry and 5xx failures are retried; only permanent rejections are dropped (with a banner).
- Entry ids are client-generated UUIDs so retries are idempotent upserts.
- Reads show the device cache, then refresh from the server. The device keeps the last 60 days; older days load from the server on demand (never deleted server-side). An unloaded day shows "Loading…" / "Not available offline", never "Nothing logged". Search and barcode lookup need a connection; recent foods work offline.

## Commands
```bash
npm run web        # dev server, opens in browser
npm test           # jest (all pure logic in src/lib)
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
npm run build:web  # static PWA export to dist/
```
