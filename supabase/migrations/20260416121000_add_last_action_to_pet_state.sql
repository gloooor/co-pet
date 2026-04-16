-- Track who performed the last pet action so we can display it in the UI.
alter table public.pet_state
add column if not exists last_action_by text,
add column if not exists last_action_type text;

