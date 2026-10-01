-- Homestays and guesthouses that no search finds can still become partners.
-- They describe themselves when applying — type, city, a pin on the map — and
-- an approval gives them a FoodTrip id ("ft-…") instead of one from a search.
-- Once they switch their room inventory on, travellers planning a trip nearby
-- are offered them beside the hotels search found (partner_hotels_near).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.partner_applications
  add column property_type text check (property_type is null or property_type in ('hotel', 'guesthouse', 'homestay', 'villa', 'hostel')),
  add column city text check (city is null or char_length(city) <= 120),
  add column lat double precision check (lat is null or lat between -90 and 90),
  add column lng double precision check (lng is null or lng between -180 and 180),
  add column description text check (description is null or char_length(description) <= 2000),
  add constraint partner_applications_pin check ((lat is null) = (lng is null));
grant insert (property_type, city, lat, lng, description) on public.partner_applications to authenticated;

alter table public.properties
  add column property_type text check (property_type is null or property_type in ('hotel', 'guesthouse', 'homestay', 'villa', 'hostel')),
  add column city text check (city is null or char_length(city) <= 120),
  add column lat double precision check (lat is null or lat between -90 and 90),
  add column lng double precision check (lng is null or lng between -180 and 180),
  add column description text check (description is null or char_length(description) <= 2000),
  add column photo_url text check (photo_url is null or (photo_url ~ '^https://' and char_length(photo_url) <= 500)),
  add column self_listed boolean not null default false,
  add constraint properties_pin check ((lat is null) = (lng is null));

-- Approval. With no hotel id, an application that pinned its location is a
-- self-listed property and gets a new FoodTrip id; one without a pin still
-- needs the id of the hotel it claims.
drop function public.admin_review_application(uuid, boolean, text, text);
create function public.admin_review_application(p_application_id uuid, p_approve boolean, p_hotel_place_id text default null, p_note text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.partner_applications%rowtype;
  v_property uuid;
  v_hotel text := nullif(btrim(coalesce(p_hotel_place_id, '')), '');
  v_self boolean := false;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  select * into v from public.partner_applications where id = p_application_id for update;
  if v.id is null then raise exception 'application-not-found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'application-already-reviewed' using errcode = '22023'; end if;

  if p_approve then
    if v_hotel is null then
      if v.lat is null then raise exception 'hotel-id-required' using errcode = '22023'; end if;
      v_hotel := 'ft-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      v_self := true;
    end if;
    insert into public.properties (hotel_place_id, name, address, phone, property_type, city, lat, lng, description, self_listed)
      values (v_hotel, v.hotel_name, v.address, v.phone, v.property_type, v.city, v.lat, v.lng, v.description, v_self)
      on conflict (hotel_place_id) do update set active = true
      returning id into v_property;
    insert into public.property_managers (property_id, user_id, role) values (v_property, v.user_id, 'owner')
      on conflict (property_id, user_id) do update set role = 'owner';
  end if;

  update public.partner_applications set
    status = case when p_approve then 'approved' else 'rejected' end,
    review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = (select auth.uid()), reviewed_at = now(), property_id = v_property
  where id = p_application_id;
  perform public.admin_log(case when p_approve then 'partner.approved' else 'partner.rejected' end, 'partner_applications', p_application_id::text,
    jsonb_build_object('hotel_name', v.hotel_name, 'hotel_place_id', v_hotel, 'self_listed', v_self, 'note', btrim(coalesce(p_note, ''))));
  return v_property;
end;
$$;
revoke all on function public.admin_review_application(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_review_application(uuid, boolean, text, text) to authenticated;

-- The admin list now carries what a self-listed applicant told about itself.
drop function public.admin_list_applications(text);
create function public.admin_list_applications(p_status text default 'pending')
returns table (id uuid, user_id uuid, email text, hotel_name text, address text, phone text, hotel_link text, message text,
  status text, review_note text, created_at timestamptz, reviewed_at timestamptz,
  property_type text, city text, lat double precision, lng double precision, description text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return query
    select a.id, a.user_id, u.email::text, a.hotel_name, a.address, a.phone, a.hotel_link, a.message, a.status, a.review_note, a.created_at, a.reviewed_at,
      a.property_type, a.city, a.lat, a.lng, a.description
    from public.partner_applications a left join auth.users u on u.id = a.user_id
    where p_status = 'all' or a.status = p_status
    order by a.created_at desc
    limit 200;
end;
$$;
revoke all on function public.admin_list_applications(text) from public, anon;
grant execute on function public.admin_list_applications(text) to authenticated;

-- What the owner shows travellers: photo, description, type, city and pin.
create function public.manager_update_listing(p_property_id uuid, p_details jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_photo text := nullif(btrim(coalesce(d->>'photo_url', '')), '');
  v_lat double precision := (d->>'lat')::double precision;
  v_lng double precision := (d->>'lng')::double precision;
begin
  if not exists (select 1 from public.property_managers where property_id = p_property_id and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'owners-only' using errcode = '42501';
  end if;
  if v_photo is not null and v_photo !~ '^https://' then raise exception 'invalid-photo-url' using errcode = '22023'; end if;
  update public.properties set
    description = nullif(btrim(coalesce(d->>'description', '')), ''),
    photo_url = v_photo,
    property_type = nullif(d->>'property_type', ''),
    city = nullif(btrim(coalesce(d->>'city', '')), ''),
    lat = v_lat,
    lng = v_lng
  where id = p_property_id;
  perform public.admin_log('property.listing_updated', 'properties', p_property_id::text);
end;
$$;
revoke all on function public.manager_update_listing(uuid, jsonb) from public, anon;
grant execute on function public.manager_update_listing(uuid, jsonb) to authenticated;

-- Partner properties taking bookings within a radius of a point, nearest
-- first, with their cheapest active room — the planner shows them beside the
-- hotels its search found.
create function public.partner_hotels_near(p_lat double precision, p_lng double precision, p_radius_km double precision default 15)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.distance_km), '[]'::jsonb) from (
    select p.hotel_place_id as id, p.name, p.address, p.city, p.lat, p.lng, p.photo_url, p.description, p.property_type,
      (select min(r.nightly_price) from public.room_inventory r where r.property_id = p.id and r.active) as price_from,
      round((6371 * 2 * asin(sqrt(power(sin(radians(p.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - p_lng) / 2), 2))))::numeric, 2) as distance_km
    from public.properties p
    where p.active and p.inventory_enabled and p.lat is not null
  ) q
  where p_lat is not null and p_lng is not null and q.distance_km <= least(greatest(coalesce(p_radius_km, 15), 1), 50)
  limit 50
$$;
revoke all on function public.partner_hotels_near(double precision, double precision, double precision) from public;
grant execute on function public.partner_hotels_near(double precision, double precision, double precision) to anon, authenticated;

-- The status lookup also returns what a booking page shows, so a partner's
-- link opens with its photo and pin even without a search result.
create or replace function public.hotel_booking_status(p_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('hotel_place_id', p.hotel_place_id, 'name', p.name, 'address', p.address,
    'photo_url', p.photo_url, 'lat', p.lat, 'lng', p.lng, 'description', p.description, 'property_type', p.property_type)), '[]'::jsonb)
  from public.properties p
  where p.hotel_place_id = any(coalesce(p_ids[1:300], '{}')) and p.active and p.inventory_enabled
$$;

notify pgrst, 'reload schema';
commit;
