-- Partner onboarding the way Agoda (YCS) and Traveloka (TERA) run it:
-- a short sign-up (property, contact, accepting the partner terms), then a
-- checklist the property completes before it can sell — photos, facilities,
-- policies, rooms and rates, where to be paid, the signed terms. Switching
-- room inventory on ("go live") is refused until every item is done.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- The partner terms a property signs: commission and when it is paid out.
-- Versioned, so what each partner accepted stays on record when they change.
create table public.partner_terms (
  version int primary key,
  commission_pct numeric(4, 2) not null check (commission_pct between 0 and 50),
  payout_days int not null check (payout_days between 0 and 60),
  summary text not null check (char_length(summary) between 20 and 4000),
  created_at timestamptz not null default now()
);
alter table public.partner_terms enable row level security;
revoke all on public.partner_terms from anon, authenticated;
grant select on public.partner_terms to anon, authenticated;
create policy partner_terms_read on public.partner_terms for select to anon, authenticated using (true);
insert into public.partner_terms (version, commission_pct, payout_days, summary) values (1, 10, 3,
'FoodTrip thu tiền phòng của khách qua chuyển khoản và giữ hộ đến khi khách trả phòng. Trong vòng 3 ngày làm việc sau ngày trả phòng, FoodTrip chuyển cho đối tác số tiền phòng trừ 10% hoa hồng vào tài khoản đối tác đã khai báo. Đối tác cam kết giữ phòng đúng loại, đúng giá đã đăng; xác nhận đơn trong 24 giờ; thông báo ngay khi không thể đón khách để FoodTrip hoàn tiền. Đơn khách huỷ được xử lý theo chính sách huỷ đối tác đã chọn. Đối tác chịu trách nhiệm về giấy phép kinh doanh lưu trú và nghĩa vụ thuế của mình. Mỗi bên có thể chấm dứt hợp tác với thông báo trước 30 ngày; các đơn đã nhận vẫn được phục vụ.');

-- Sign-up: who is applying, how big the place is, its papers if any, and the
-- terms accepted (the time is the server's, not the browser's).
alter table public.partner_applications
  add column contact_name text check (contact_name is null or char_length(btrim(contact_name)) between 2 and 120),
  add column contact_role text check (contact_role is null or contact_role in ('owner', 'manager')),
  add column room_count int check (room_count is null or room_count between 1 and 2000),
  add column star_rating int check (star_rating is null or star_rating between 0 and 5),
  add column business_license text check (business_license is null or char_length(business_license) <= 50),
  add column tax_code text check (tax_code is null or tax_code ~ '^[0-9-]{10,14}$'),
  add column terms_version int references public.partner_terms (version),
  add column terms_accepted_at timestamptz;
grant insert (contact_name, contact_role, room_count, star_rating, business_license, tax_code, terms_version) on public.partner_applications to authenticated;

create function public.partner_applications_terms() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.terms_version is null then raise exception 'terms-required' using errcode = '22023'; end if;
  new.terms_accepted_at := now();
  return new;
end $$;
create trigger partner_applications_terms before insert on public.partner_applications
  for each row execute function public.partner_applications_terms();

-- What a property shows and promises.
alter table public.properties
  add column gallery text[] not null default '{}' check (cardinality(gallery) <= 12),
  add column amenities text[] not null default '{}' check (cardinality(amenities) <= 30),
  add column check_in_time time,
  add column check_out_time time,
  add column cancellation_policy text check (cancellation_policy is null or cancellation_policy in ('flexible', 'moderate', 'strict', 'non_refundable')),
  add column house_rules text check (house_rules is null or char_length(house_rules) <= 2000),
  add column contact_name text,
  add column room_count int,
  add column star_rating int check (star_rating is null or star_rating between 0 and 5),
  add column business_license text,
  add column tax_code text,
  add column terms_version int references public.partner_terms (version),
  add column terms_accepted_at timestamptz;

-- Where FoodTrip pays the property. Only its owner and admins can read it.
create table public.property_payouts (
  property_id uuid primary key references public.properties (id) on delete cascade,
  bank_name text not null check (char_length(btrim(bank_name)) between 2 and 100),
  account_number text not null check (account_number ~ '^[0-9]{6,20}$'),
  account_holder text not null check (char_length(btrim(account_holder)) between 2 and 100),
  updated_at timestamptz not null default now()
);
alter table public.property_payouts enable row level security;
revoke all on public.property_payouts from anon, authenticated;
grant select on public.property_payouts to authenticated;
create policy property_payouts_read on public.property_payouts for select to authenticated using (
  exists (select 1 from public.property_managers m where m.property_id = property_payouts.property_id and m.user_id = (select auth.uid()) and m.role = 'owner')
  or (select public.is_admin()));

create function public.manager_set_payout(p_property_id uuid, p_bank text, p_account text, p_holder text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.property_managers where property_id = p_property_id and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'owners-only' using errcode = '42501';
  end if;
  insert into public.property_payouts (property_id, bank_name, account_number, account_holder)
    values (p_property_id, btrim(p_bank), regexp_replace(coalesce(p_account, ''), '\s', '', 'g'), upper(btrim(p_holder)))
    on conflict (property_id) do update set bank_name = excluded.bank_name, account_number = excluded.account_number,
      account_holder = excluded.account_holder, updated_at = now();
  -- The log says it changed, never the number.
  perform public.admin_log('property.payout_updated', 'properties', p_property_id::text);
end $$;
revoke all on function public.manager_set_payout(uuid, text, text, text) from public, anon;
grant execute on function public.manager_set_payout(uuid, text, text, text) to authenticated;

-- For a property approved before it accepted terms (or when terms change).
create function public.manager_accept_terms(p_property_id uuid, p_version int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.property_managers where property_id = p_property_id and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'owners-only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.partner_terms where version = p_version) then raise exception 'terms-required' using errcode = '22023'; end if;
  update public.properties set terms_version = p_version, terms_accepted_at = now() where id = p_property_id;
  perform public.admin_log('property.terms_accepted', 'properties', p_property_id::text, jsonb_build_object('version', p_version));
end $$;
revoke all on function public.manager_accept_terms(uuid, int) from public, anon;
grant execute on function public.manager_accept_terms(uuid, int) to authenticated;

-- Facilities a property can tick, as codes the app translates.
create function public.property_amenity_codes() returns text[] language sql immutable set search_path = '' as $$
  select array['wifi', 'aircon', 'parking', 'breakfast', 'kitchen', 'pool', 'laundry', 'airport_shuttle', 'front_desk_24h',
    'elevator', 'family_rooms', 'pets', 'non_smoking', 'motorbike_rental', 'garden', 'bbq']
$$;

-- The listing editor now also takes the gallery, facilities and policies.
create or replace function public.manager_update_listing(p_property_id uuid, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_gallery text[] := coalesce((select array_agg(btrim(x) order by n) from jsonb_array_elements_text(
    case when jsonb_typeof(d->'gallery') = 'array' then d->'gallery' else '[]'::jsonb end) with ordinality as g(x, n) where btrim(x) <> '' and n <= 12), '{}');
  v_amenities text[] := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(
    case when jsonb_typeof(d->'amenities') = 'array' then d->'amenities' else '[]'::jsonb end) as a(x)
    where x = any(public.property_amenity_codes())), '{}');
begin
  if not exists (select 1 from public.property_managers where property_id = p_property_id and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'owners-only' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_gallery) u where u !~ '^https://') then raise exception 'invalid-photo-url' using errcode = '22023'; end if;
  update public.properties set
    description = nullif(btrim(coalesce(d->>'description', '')), ''),
    gallery = v_gallery,
    photo_url = v_gallery[1],
    property_type = nullif(d->>'property_type', ''),
    city = nullif(btrim(coalesce(d->>'city', '')), ''),
    lat = (d->>'lat')::double precision,
    lng = (d->>'lng')::double precision,
    amenities = v_amenities,
    check_in_time = nullif(d->>'check_in_time', '')::time,
    check_out_time = nullif(d->>'check_out_time', '')::time,
    cancellation_policy = nullif(d->>'cancellation_policy', ''),
    house_rules = nullif(btrim(coalesce(d->>'house_rules', '')), '')
  where id = p_property_id;
  perform public.admin_log('property.listing_updated', 'properties', p_property_id::text);
end $$;

-- The go-live checklist, item by item. Internal (no permission check) for the
-- trigger; the public wrapper answers only the property's people and admins.
create function public.property_readiness_internal(p_property_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'listing', cardinality(p.gallery) >= 3 and char_length(coalesce(p.description, '')) >= 30 and p.lat is not null,
    'amenities', cardinality(p.amenities) >= 1,
    'policies', p.check_in_time is not null and p.check_out_time is not null and p.cancellation_policy is not null,
    'rooms', exists (select 1 from public.room_inventory r where r.property_id = p.id and r.active),
    'payout', exists (select 1 from public.property_payouts x where x.property_id = p.id),
    'terms', p.terms_accepted_at is not null)
  from public.properties p where p.id = p_property_id
$$;
revoke all on function public.property_readiness_internal(uuid) from public, anon, authenticated;

create function public.property_readiness(p_property_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.property_readiness_internal(p_property_id)
  where public.manages_property(p_property_id) or public.is_admin()
$$;
revoke all on function public.property_readiness(uuid) from public, anon;
grant execute on function public.property_readiness(uuid) to authenticated;

-- Going live needs every item. Checked on the row, so no path around it.
create function public.guard_property_go_live() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; missing text;
begin
  if new.inventory_enabled and not coalesce(old.inventory_enabled, false) then
    r := public.property_readiness_internal(new.id);
    select string_agg(key, ',') into missing from jsonb_each(r) where value = 'false'::jsonb;
    if missing is not null then raise exception 'listing-incomplete:%', missing using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_property_go_live() from public, anon, authenticated;
create trigger properties_go_live before update of inventory_enabled on public.properties
  for each row execute function public.guard_property_go_live();

-- Approval carries the sign-up details and the accepted terms over.
create or replace function public.admin_review_application(p_application_id uuid, p_approve boolean, p_hotel_place_id text default null, p_note text default '')
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
    insert into public.properties (hotel_place_id, name, address, phone, property_type, city, lat, lng, description, self_listed,
        contact_name, room_count, star_rating, business_license, tax_code, terms_version, terms_accepted_at)
      values (v_hotel, v.hotel_name, v.address, v.phone, v.property_type, v.city, v.lat, v.lng, v.description, v_self,
        v.contact_name, v.room_count, v.star_rating, v.business_license, v.tax_code, v.terms_version, v.terms_accepted_at)
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

-- The admin list shows the sign-up details too.
drop function public.admin_list_applications(text);
create function public.admin_list_applications(p_status text default 'pending')
returns table (id uuid, user_id uuid, email text, hotel_name text, address text, phone text, hotel_link text, message text,
  status text, review_note text, created_at timestamptz, reviewed_at timestamptz,
  property_type text, city text, lat double precision, lng double precision, description text,
  contact_name text, contact_role text, room_count int, star_rating int, business_license text, tax_code text, terms_version int, terms_accepted_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return query
    select a.id, a.user_id, u.email::text, a.hotel_name, a.address, a.phone, a.hotel_link, a.message, a.status, a.review_note, a.created_at, a.reviewed_at,
      a.property_type, a.city, a.lat, a.lng, a.description,
      a.contact_name, a.contact_role, a.room_count, a.star_rating, a.business_license, a.tax_code, a.terms_version, a.terms_accepted_at
    from public.partner_applications a left join auth.users u on u.id = a.user_id
    where p_status = 'all' or a.status = p_status
    order by a.created_at desc
    limit 200;
end;
$$;
revoke all on function public.admin_list_applications(text) from public, anon;
grant execute on function public.admin_list_applications(text) to authenticated;

-- Travellers' side: what the booking page and cards show of a partner.
create or replace function public.hotel_booking_status(p_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('hotel_place_id', p.hotel_place_id, 'name', p.name, 'address', p.address,
    'photo_url', p.photo_url, 'gallery', to_jsonb(p.gallery), 'lat', p.lat, 'lng', p.lng, 'description', p.description,
    'property_type', p.property_type, 'star_rating', p.star_rating, 'amenities', to_jsonb(p.amenities),
    'check_in_time', to_char(p.check_in_time, 'HH24:MI'), 'check_out_time', to_char(p.check_out_time, 'HH24:MI'),
    'cancellation_policy', p.cancellation_policy, 'house_rules', p.house_rules)), '[]'::jsonb)
  from public.properties p
  where p.hotel_place_id = any(coalesce(p_ids[1:300], '{}')) and p.active and p.inventory_enabled
$$;

create or replace function public.partner_hotels_near(p_lat double precision, p_lng double precision, p_radius_km double precision default 15)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.distance_km), '[]'::jsonb) from (
    select p.hotel_place_id as id, p.name, p.address, p.city, p.lat, p.lng, p.photo_url, to_jsonb(p.gallery) as gallery, p.description,
      p.property_type, p.star_rating, to_jsonb(p.amenities) as amenities, p.cancellation_policy,
      (select min(r.nightly_price) from public.room_inventory r where r.property_id = p.id and r.active) as price_from,
      round((6371 * 2 * asin(sqrt(power(sin(radians(p.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - p_lng) / 2), 2))))::numeric, 2) as distance_km
    from public.properties p
    where p.active and p.inventory_enabled and p.lat is not null
  ) q
  where p_lat is not null and p_lng is not null and q.distance_km <= least(greatest(coalesce(p_radius_km, 15), 1), 50)
  limit 50
$$;

notify pgrst, 'reload schema';
commit;
