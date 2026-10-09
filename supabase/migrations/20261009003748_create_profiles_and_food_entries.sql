-- Per-user body stats and daily targets. Targets are computed in app code (src/lib/targets.ts) and saved here.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  sex text check (sex in ('male', 'female')),
  age integer check (age between 13 and 120),
  height_cm numeric(5, 1) check (height_cm between 90 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 25 and 400),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  unit_system text not null default 'imperial' check (unit_system in ('metric', 'imperial')),
  target_calories integer check (target_calories between 0 and 10000),
  target_protein_g integer check (target_protein_g between 0 and 1000),
  target_carbs_g integer check (target_carbs_g between 0 and 2000),
  target_fat_g integer check (target_fat_g between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can select" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: owner can update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- One logged food. Nutrients are a per-100g snapshot from the source so history never changes
-- if the source data does. Totals are NOT stored; the app computes them from grams * per-100g.
-- id is generated on the client so offline-queued inserts can be retried idempotently.
create table public.food_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snacks')),
  food_name text not null check (char_length(food_name) between 1 and 200),
  brand text check (char_length(brand) <= 200),
  source text not null check (source in ('usda', 'off', 'custom')),
  source_id text check (char_length(source_id) <= 64),
  quantity numeric not null check (quantity > 0 and quantity <= 100000),
  unit text not null check (unit in ('g', 'oz', 'serving')),
  serving_grams numeric check (serving_grams > 0),
  serving_label text check (char_length(serving_label) <= 100),
  grams numeric not null check (grams > 0 and grams <= 100000),
  kcal_per_100g numeric not null check (kcal_per_100g >= 0),
  protein_per_100g numeric not null check (protein_per_100g >= 0),
  carbs_per_100g numeric not null check (carbs_per_100g >= 0),
  fat_per_100g numeric not null check (fat_per_100g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint serving_unit_needs_grams check (unit <> 'serving' or serving_grams is not null)
);

create index food_entries_user_date_idx on public.food_entries (user_id, entry_date);

alter table public.food_entries enable row level security;

create policy "food_entries: owner can select" on public.food_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "food_entries: owner can insert" on public.food_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "food_entries: owner can update" on public.food_entries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "food_entries: owner can delete" on public.food_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- Keep updated_at current.
create function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger food_entries_set_updated_at before update on public.food_entries
  for each row execute function public.set_updated_at();
