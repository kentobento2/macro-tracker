-- One weigh-in per user per day. Weight is stored in kilograms (canonical); the app converts to lb.
-- The (user_id, entry_date) primary key enforces "one per day": saving again for the same day
-- replaces the earlier value (the app upserts on this key).
create table public.body_weights (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date date not null,
  weight_kg numeric(6, 3) not null check (weight_kg between 20 and 400),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

alter table public.body_weights enable row level security;

create policy "body_weights: owner can select" on public.body_weights
  for select to authenticated using (user_id = (select auth.uid()));
create policy "body_weights: owner can insert" on public.body_weights
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "body_weights: owner can update" on public.body_weights
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "body_weights: owner can delete" on public.body_weights
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger body_weights_set_updated_at before update on public.body_weights
  for each row execute function public.set_updated_at();
