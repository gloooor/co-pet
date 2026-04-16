-- Create required extension for gen_random_uuid()
create extension if not exists pgcrypto;

-- Enum for the pet mood
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pet_mood') then
    create type pet_mood as enum ('happy', 'sad', 'hungry');
  end if;
end$$;

-- Table: pet_state
create table if not exists public.pet_state (
  id uuid primary key default gen_random_uuid(),
  mood pet_mood not null,
  hunger_level integer not null check (hunger_level >= 0 and hunger_level <= 100),
  last_updated timestamptz not null default now()
);

-- Keep last_updated current on updates
create or replace function public.set_last_updated()
returns trigger
language plpgsql
as $$
begin
  new.last_updated = now();
  return new;
end;
$$;

drop trigger if exists trg_pet_state_last_updated on public.pet_state;
create trigger trg_pet_state_last_updated
before update on public.pet_state
for each row execute function public.set_last_updated();

