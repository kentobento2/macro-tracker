-- Favorite foods, per user. A favorite is a snapshot of the food (name, per-100g nutrients,
-- serving sizes) plus the portion you last saved it with, so it can be logged in one tap,
-- even offline. food_key identifies the food ("usda:2709224", "off:0737628064502") and is
-- computed by the app; (user_id, food_key) makes favoriting idempotent.
create table public.favorite_foods (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_key text not null check (char_length(food_key) between 3 and 300),
  source text not null check (source in ('usda', 'off', 'custom')),
  source_id text check (char_length(source_id) <= 64),
  food_name text not null check (char_length(food_name) between 1 and 200),
  brand text check (char_length(brand) <= 200),
  kcal_per_100g numeric not null check (kcal_per_100g >= 0),
  protein_per_100g numeric not null check (protein_per_100g >= 0),
  carbs_per_100g numeric not null check (carbs_per_100g >= 0),
  fat_per_100g numeric not null check (fat_per_100g >= 0),
  servings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(servings) = 'array' and jsonb_array_length(servings) <= 50),
  -- Default portion to pre-fill when logging the favorite.
  quantity numeric not null check (quantity > 0 and quantity <= 100000),
  unit text not null check (unit in ('g', 'oz', 'serving')),
  serving_label text check (char_length(serving_label) <= 100),
  serving_grams numeric check (serving_grams > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, food_key),
  constraint favorite_serving_unit_needs_grams check (unit <> 'serving' or serving_grams is not null)
);

alter table public.favorite_foods enable row level security;

create policy "favorite_foods: owner can select" on public.favorite_foods
  for select to authenticated using (user_id = (select auth.uid()));
create policy "favorite_foods: owner can insert" on public.favorite_foods
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "favorite_foods: owner can update" on public.favorite_foods
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "favorite_foods: owner can delete" on public.favorite_foods
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger favorite_foods_set_updated_at before update on public.favorite_foods
  for each row execute function public.set_updated_at();
