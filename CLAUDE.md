# Macro Tracker

Expo (TypeScript, Expo Router) app shipped primarily as a mobile-first PWA on web, backed by Supabase. Product requirements live in `SPEC.md`.

@AGENTS.md

## Project rules

### Macro math lives in its own tested module
- All nutrition/macro calculations (calories from macros, totals, scaling by servings, targets, remaining, etc.) go in `src/lib/macros.ts` — or sibling files under `src/lib/` if it grows.
- That module stays pure: no React, no Supabase, no I/O, no `Date.now()`. Inputs in, numbers out.
- Screens and components call into it; they never inline macro arithmetic.
- Every new or changed function gets tests in `src/lib/__tests__/`. Run `npm test` and make sure it passes before declaring work done.

### Never commit secrets
- `.env` is gitignored and must stay that way. Put new config keys in `.env.example` with placeholder values.
- Client code may only use `EXPO_PUBLIC_*` variables, and those are bundled into the public app. Only the Supabase **anon** key belongs there.
- Never add the Supabase `service_role` key, database passwords, or any other private credential to this repo or to `EXPO_PUBLIC_*` vars. Security is enforced with Row Level Security in Supabase, not by hiding the anon key.
- Before committing, check `git status` / `git diff --staged` for keys or tokens.

### Mobile-first UI
- Design for a ~375px-wide phone screen first; larger screens get a centered column (max ~480px), not a desktop layout.
- Touch targets at least 44×44pt; primary actions reachable with a thumb (bottom of the screen).
- Respect safe areas (`react-native-safe-area-context`), support light and dark mode.
- Use React Native primitives so screens work on web and native; keep web-only code in `.web.tsx` files or behind `Platform.OS === 'web'`.
- Check changes at phone width in the browser (`npm run web`, devtools device mode).

## Layout
- `src/app/` — Expo Router routes only (`+html.tsx` is the web HTML shell with PWA meta tags).
- `src/lib/supabase.ts` — the single Supabase client; import it, don't create others.
- `src/lib/macros.ts` — macro math (see above).
- `public/` — static web files: `manifest.json`, `sw.js`, icons.

## Commands
```bash
npm run web        # dev server, opens in browser
npm test           # jest (macro math tests)
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
npm run build:web  # static PWA export to dist/
```
