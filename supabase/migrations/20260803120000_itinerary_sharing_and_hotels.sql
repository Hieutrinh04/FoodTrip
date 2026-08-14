-- Public sharing for saved itineraries ("share with a friend" link) and
-- hotel suggestions attached to a generated plan. Sharing is an explicit
-- opt-in flag rather than making itineraries public by default, since most
-- saved trips are private.
alter table public.itineraries add column if not exists is_public boolean not null default false;
alter table public.itineraries add column if not exists hotels jsonb not null default '[]';

create policy "itineraries_public_select" on public.itineraries
  for select using (is_public = true);

create policy "itineraries_owner_update" on public.itineraries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
