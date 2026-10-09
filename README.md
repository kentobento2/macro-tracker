# Macro Tracker

Mobile-first PWA for tracking calories and macros. Two people, each with their own Google login and private log.

- **Today:** breakfast, lunch, dinner and snacks with daily totals vs targets
- **Add food:** search USDA FoodData Central, scan a barcode (Open Food Facts), log in grams, ounces or servings
- **History:** any past day plus a 7-day average
- **Settings:** targets calculated from your stats (Mifflin-St Jeor), or entered by hand
- **Offline:** the log and settings work without a connection and sync when you're back

Built with Expo (TypeScript, Expo Router) and Supabase.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env` and set your Supabase project URL and anon/publishable key.
3. `npm run web`

## One-time Supabase setup

- **Google sign-in:** Supabase Dashboard → Authentication → Sign In / Providers → Google (needs a Google Cloud OAuth client).
- **Redirect URLs:** Authentication → URL Configuration → add `http://localhost:8081` (and your deployed URL).
- **USDA API key:** get a free key at https://fdc.nal.usda.gov/api-key-signup and add it as the Edge Function secret `FDC_API_KEY`.

Database migrations are in `supabase/migrations/`; the food lookup Edge Function is in `supabase/functions/food-lookup/`.

See `CLAUDE.md` for project rules and commands.
