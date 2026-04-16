-- New stats for the game loop:
-- - happiness is spent over time (play raises it)
-- - food is spent over time (feed raises it; play depletes it)
-- - energy is spent over time (rest raises it; play depletes it)
alter table public.pet_state
add column if not exists happiness integer not null default 60 check (happiness >= 0 and happiness <= 100),
add column if not exists food integer not null default 60 check (food >= 0 and food <= 100),
add column if not exists energy integer not null default 60 check (energy >= 0 and energy <= 100);

