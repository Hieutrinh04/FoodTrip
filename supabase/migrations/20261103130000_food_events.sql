-- Food events: festivals, food fairs, night markets and walking streets.
--
-- Nothing is seeded: an event exists only when an administrator or a partner
-- (the owner of a stay, the owner or manager of a tour operator) enters it. A
-- partner's entry waits for review ('pending'); the public reads only what an
-- administrator published. Two kinds:
--   * one-off:  starts_at .. ends_at
--   * weekly:   weekly_days (0 = Sunday … 6 = Saturday, Vietnam time) from
--               weekly_start to weekly_end (an end before the start runs past
--               midnight), optionally between valid_from and valid_until.
-- Prices are whatever the person entering the event wrote (price_note); the
-- app never computes or guesses one.
begin;

create table public.food_events (
  id uuid primary key default gen_random_uuid(),
  title_vi text not null check (char_length(btrim(title_vi)) between 3 and 200),
  title_en text check (title_en is null or char_length(title_en) <= 200),
  summary text not null check (char_length(btrim(summary)) between 10 and 2000),
  city_id text not null check (city_id ~ '^[a-z]{2,20}$'),
  venue text not null check (char_length(btrim(venue)) between 2 and 200),
  address text check (address is null or char_length(address) <= 300),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  starts_at timestamptz,
  ends_at timestamptz,
  weekly_days smallint[] check (weekly_days is null or (cardinality(weekly_days) between 1 and 7 and weekly_days <@ array[0,1,2,3,4,5,6]::smallint[])),
  weekly_start time,
  weekly_end time,
  valid_from date,
  valid_until date,
  is_free boolean,
  price_note text check (price_note is null or char_length(price_note) <= 200),
  official_url text check (official_url is null or (official_url ~ '^https://' and char_length(official_url) <= 500)),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (
    (starts_at is not null and ends_at is not null and ends_at > starts_at
      and weekly_days is null and weekly_start is null and weekly_end is null)
    or (weekly_days is not null and weekly_start is not null and weekly_end is not null and weekly_start <> weekly_end
      and starts_at is null and ends_at is null)
  ),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check ((lat is null) = (lng is null))
);
create index food_events_city_idx on public.food_events (city_id, status);
create index food_events_creator_idx on public.food_events (created_by);
alter table public.food_events enable row level security;

-- Whether the caller owns a stay, or owns or manages a tour operator.
create function public.is_food_event_partner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.property_managers pm where pm.user_id = (select auth.uid()) and pm.role = 'owner')
      or exists (select 1 from public.tour_members tm where tm.user_id = (select auth.uid()) and tm.role in ('owner', 'manager'))
$$;
revoke all on function public.is_food_event_partner() from public;
grant execute on function public.is_food_event_partner() to authenticated;

grant select on public.food_events to anon, authenticated;
grant insert, update, delete on public.food_events to authenticated;

create policy food_events_public_select on public.food_events for select to anon, authenticated
  using (status = 'published');
create policy food_events_own_select on public.food_events for select to authenticated
  using (created_by = (select auth.uid()));
create policy food_events_admin_select on public.food_events for select to authenticated
  using ((select public.is_admin()));

-- A partner proposes; only an administrator publishes.
create policy food_events_partner_insert on public.food_events for insert to authenticated
  with check (status = 'pending' and created_by = (select auth.uid()) and (select public.is_food_event_partner()));
create policy food_events_admin_insert on public.food_events for insert to authenticated
  with check ((select public.is_admin()));

-- The proposer may correct or withdraw an entry while it waits for review.
create policy food_events_own_update on public.food_events for update to authenticated
  using (created_by = (select auth.uid()) and status = 'pending')
  with check (created_by = (select auth.uid()) and status = 'pending');
create policy food_events_own_delete on public.food_events for delete to authenticated
  using (created_by = (select auth.uid()) and status = 'pending');
create policy food_events_admin_update on public.food_events for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy food_events_admin_delete on public.food_events for delete to authenticated
  using ((select public.is_admin()));

create function public.food_events_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  -- Review fields belong to administrators.
  if not (select public.is_admin()) then
    new.review_note := old.review_note;
    new.reviewed_at := old.reviewed_at;
    new.created_by := old.created_by;
  elsif new.status is distinct from old.status then
    new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger food_events_touch before update on public.food_events
  for each row execute function public.food_events_touch();

notify pgrst, 'reload schema';
commit;
