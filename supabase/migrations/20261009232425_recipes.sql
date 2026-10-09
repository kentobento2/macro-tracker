-- Recipes: dishes made from several ingredients. Ingredients are stored as snapshots (food + amount), so a
-- recipe never changes if a food database does. A portion is a share of the batch by cooked weight or by
-- servings, so at least one of the two is required.
create table public.recipes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  ingredients jsonb not null
    check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) between 1 and 50),
  servings numeric check (servings > 0 and servings <= 100),
  cooked_grams numeric check (cooked_grams > 0 and cooked_grams <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_needs_yield check (servings is not null or cooked_grams is not null)
);

create index recipes_user_idx on public.recipes (user_id);

alter table public.recipes enable row level security;

create policy "recipes: owner can select" on public.recipes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "recipes: owner can insert" on public.recipes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "recipes: owner can update" on public.recipes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recipes: owner can delete" on public.recipes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Logged entries and favorites can now be a recipe.
alter table public.food_entries drop constraint food_entries_source_check;
alter table public.food_entries
  add constraint food_entries_source_check check (source in ('usda', 'off', 'custom', 'recipe'));
alter table public.favorite_foods drop constraint favorite_foods_source_check;
alter table public.favorite_foods
  add constraint favorite_foods_source_check check (source in ('usda', 'off', 'custom', 'recipe'));

-- A logged recipe keeps its ingredient breakdown (for "show ingredients"), so editing the recipe later
-- never changes past entries. Null for everything that isn't a recipe.
alter table public.food_entries
  add column recipe jsonb
  check (recipe is null or (jsonb_typeof(recipe) = 'object' and pg_column_size(recipe) <= 20000));
