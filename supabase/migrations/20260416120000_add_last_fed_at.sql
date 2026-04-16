-- Track when the pet was last fed.
-- Used to increase hunger automatically when the pet hasn't been fed recently.
alter table public.pet_state
add column if not exists last_fed_at timestamptz not null default now();

