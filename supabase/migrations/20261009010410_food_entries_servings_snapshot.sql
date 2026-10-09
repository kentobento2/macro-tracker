-- Snapshot of the food's serving sizes ([{label, grams}]) so editing an entry or re-logging it
-- from "recent foods" still offers "1 banana", "1 cup", etc.
alter table public.food_entries
  add column servings jsonb not null default '[]'::jsonb
  check (jsonb_typeof(servings) = 'array' and jsonb_array_length(servings) <= 50);
