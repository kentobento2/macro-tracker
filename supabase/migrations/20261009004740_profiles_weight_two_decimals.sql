-- Two decimals so imperial weights round-trip (180 lb -> 81.65 kg -> 180.0 lb).
alter table public.profiles alter column weight_kg type numeric(6, 2);
