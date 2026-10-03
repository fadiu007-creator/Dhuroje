-- Add Geev-style profile location and optional age
alter table public.dhuroje_profiles
  add column if not exists city text;

alter table public.dhuroje_profiles
  add column if not exists age integer;

alter table public.dhuroje_profiles
  drop constraint if exists dhuroje_profiles_age_check;

alter table public.dhuroje_profiles
  add constraint dhuroje_profiles_age_check
  check (age is null or (age >= 13 and age <= 120));