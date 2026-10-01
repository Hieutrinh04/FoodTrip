-- The tour page travellers see before choosing a tour in the planner: photos,
-- a short introduction for the suggestion card, highlights, the programme day
-- by day, what the price covers and does not, and the policies. Operators
-- edit it through tour_update_details; travellers read it through
-- tour_catalog (cards) and tour_detail (the full page).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.tours
  add column summary text check (summary is null or length(summary) <= 600),
  add column cover_url text check (cover_url is null or (cover_url ~ '^https://' and length(cover_url) <= 500)),
  add column gallery text[] not null default '{}' check (cardinality(gallery) <= 12),
  add column highlights text[] not null default '{}' check (cardinality(highlights) <= 10),
  add column schedule jsonb not null default '[]' check (jsonb_typeof(schedule) = 'array' and jsonb_array_length(schedule) <= 15),
  add column includes text[] not null default '{}' check (cardinality(includes) <= 30),
  add column excludes text[] not null default '{}' check (cardinality(excludes) <= 30),
  add column transport text check (transport is null or length(transport) <= 120),
  add column start_point text check (start_point is null or length(start_point) <= 200),
  add column child_policy text check (child_policy is null or length(child_policy) <= 3000),
  add column cancel_policy text check (cancel_policy is null or length(cancel_policy) <= 3000),
  add column notes text check (notes is null or length(notes) <= 3000);

-- A JSON array of strings as a clean text[]: trimmed, blanks dropped, each
-- item cut to max_len, at most max_items. Anything that is not an array is
-- an empty list.
create function public.tour_text_list(p jsonb, max_items int, max_len int) returns text[]
language sql immutable set search_path='' as $$
  select coalesce(array_agg(item order by n), '{}') from (
    select left(btrim(value), max_len) as item, n
    from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as e(value, n)
    where btrim(value) <> ''
    order by n limit max_items
  ) items
$$;
revoke all on function public.tour_text_list(jsonb,int,int) from public, anon, authenticated;

create function public.tour_update_details(p_tour uuid, p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  t public.tours;
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_gallery text[] := public.tour_text_list(d->'gallery', 12, 500);
  v_cover text := nullif(btrim(coalesce(d->>'cover_url', '')), '');
  v_schedule jsonb;
begin
  select * into t from public.tours where id = p_tour;
  if t.id is null or not public.tour_can_manage(t.operator_id) then raise exception 'not-your-operator'; end if;
  -- Photos are shown to every traveller; only secure links are accepted.
  if (v_cover is not null and v_cover !~ '^https://') or exists(select 1 from unnest(v_gallery) u where u !~ '^https://') then
    raise exception 'invalid-photo-url';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'title', left(btrim(e->>'title'), 200),
      'meals', left(btrim(coalesce(e->>'meals', '')), 120),
      'body', left(btrim(coalesce(e->>'body', '')), 4000)) order by n), '[]'::jsonb)
    into v_schedule
    from jsonb_array_elements(case when jsonb_typeof(d->'schedule') = 'array' then d->'schedule' else '[]'::jsonb end) with ordinality as s(e, n)
    where jsonb_typeof(e) = 'object' and btrim(coalesce(e->>'title', '')) <> '' and n <= 15;
  update public.tours set
    summary = nullif(btrim(coalesce(d->>'summary', '')), ''),
    cover_url = coalesce(v_cover, v_gallery[1]),
    gallery = v_gallery,
    highlights = public.tour_text_list(d->'highlights', 10, 300),
    schedule = v_schedule,
    includes = public.tour_text_list(d->'includes', 30, 300),
    excludes = public.tour_text_list(d->'excludes', 30, 300),
    transport = nullif(btrim(coalesce(d->>'transport', '')), ''),
    start_point = nullif(btrim(coalesce(d->>'start_point', '')), ''),
    child_policy = nullif(btrim(coalesce(d->>'child_policy', '')), ''),
    cancel_policy = nullif(btrim(coalesce(d->>'cancel_policy', '')), ''),
    notes = nullif(btrim(coalesce(d->>'notes', '')), '')
  where id = p_tour;
  perform public.admin_log('tour.details_updated', 'tours', p_tour::text);
end $$;
revoke all on function public.tour_update_details(uuid,jsonb) from public, anon;
grant execute on function public.tour_update_details(uuid,jsonb) to authenticated;

-- Seats still free on a departure: capacity less every active request.
create function public.tour_seats_left(p_departure uuid) returns int
language sql stable security definer set search_path='' as $$
  select greatest(0, d.capacity - coalesce((select sum(b.seats) from public.tour_reservations b
    where b.departure_id = d.id and b.status in ('requested','confirmed','completed')), 0))::int
  from public.tour_departures d where d.id = p_departure
$$;
revoke all on function public.tour_seats_left(uuid) from public, anon, authenticated;

-- The cards: one row per open departure, now with what a card shows.
create or replace function public.tour_catalog() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(q), '[]'::jsonb) from (
    select d.id, t.id as tour_id, d.starts_at, d.ends_at, d.price, d.capacity, t.title, t.description, t.destination, t.meeting_point,
      o.name as operator_name, t.summary, t.cover_url, t.highlights[1:3] as highlights, t.transport,
      public.tour_seats_left(d.id) as available
    from public.tour_departures d join public.tours t on t.id = d.tour_id join public.tour_operators o on o.id = t.operator_id
    where d.status = 'open' and d.starts_at > now() and t.published and o.status = 'approved' order by d.starts_at limit 200
  ) q
$$;

-- The full tour page with its open departures. Only published tours of
-- approved operators; anything else reads as not found.
create function public.tour_detail(p_tour uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id', t.id, 'title', t.title, 'destination', t.destination, 'description', t.description,
    'meeting_point', t.meeting_point, 'operator_name', o.name, 'summary', t.summary,
    'cover_url', t.cover_url, 'gallery', to_jsonb(t.gallery), 'highlights', to_jsonb(t.highlights),
    'schedule', t.schedule, 'includes', to_jsonb(t.includes), 'excludes', to_jsonb(t.excludes),
    'transport', t.transport, 'start_point', t.start_point, 'child_policy', t.child_policy,
    'cancel_policy', t.cancel_policy, 'notes', t.notes,
    'departures', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'price', d.price,
          'capacity', d.capacity, 'available', public.tour_seats_left(d.id)) order by d.starts_at)
      from public.tour_departures d where d.tour_id = t.id and d.status = 'open' and d.starts_at > now()), '[]'::jsonb))
  from public.tours t join public.tour_operators o on o.id = t.operator_id
  where t.id = p_tour and t.published and o.status = 'approved'
$$;
revoke all on function public.tour_detail(uuid) from public;
grant execute on function public.tour_detail(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
