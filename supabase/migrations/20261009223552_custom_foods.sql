-- Custom foods: the user's own foods, with nutrition entered per serving (from a label, a menu or a recipe).
-- Logged entries keep their own per-100 g snapshot, so editing or deleting a custom food never changes
-- history. id is generated on the client so offline-queued saves can be retried idempotently.
create table public.custom_foods (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  brand text check (char_length(brand) between 1 and 80),
  serving_label text not null check (char_length(serving_label) between 1 and 60),
  -- Weight of one serving; null when unknown (e.g. a restaurant meal).
  serving_grams numeric check (serving_grams > 0 and serving_grams <= 3000),
  -- Per serving. Null calories = not entered (the app derives them from the macros).
  kcal numeric check (kcal >= 0 and kcal <= 10000),
  protein_g numeric not null check (protein_g >= 0 and protein_g <= 1000),
  carbs_g numeric not null check (carbs_g >= 0 and carbs_g <= 1000),
  fat_g numeric not null check (fat_g >= 0 and fat_g <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_foods_user_idx on public.custom_foods (user_id);

alter table public.custom_foods enable row level security;

create policy "custom_foods: owner can select" on public.custom_foods
  for select to authenticated using (user_id = (select auth.uid()));
create policy "custom_foods: owner can insert" on public.custom_foods
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "custom_foods: owner can update" on public.custom_foods
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "custom_foods: owner can delete" on public.custom_foods
  for delete to authenticated using (user_id = (select auth.uid()));
