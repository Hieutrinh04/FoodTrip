-- Hotel partners: the people who run the places travellers book.
--
-- properties            a hotel or guesthouse on FoodTrip, tied to bookings by
--                       hotel_place_id (the id the booking page uses)
-- property_managers     who runs it: 'owner' or 'staff'
-- partner_applications  "we run this hotel" requests, reviewed by an admin
-- bookings.fulfillment_status
--                       the hotel's side of a booking, separate from payment:
--                       awaiting → confirmed → checked_in → completed, or
--                       rejected / no_show. Payment stays FoodTrip's: a hotel
--                       rejecting a paid booking leaves it paid, flagged for an
--                       admin to refund.
--
-- A manager sees only bookings for their own properties, and changes them
-- only through manager_set_fulfillment, which checks the transition and
-- writes the audit log. Travellers cannot touch the fulfillment fields.

begin;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  hotel_place_id text not null unique check (char_length(hotel_place_id) between 1 and 300),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  address text,
  phone text,
  email text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.property_managers (
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);
create index property_managers_user_idx on public.property_managers (user_id);

create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hotel_name text not null check (char_length(btrim(hotel_name)) between 2 and 200),
  address text not null check (char_length(btrim(address)) between 5 and 500),
  phone text not null check (char_length(btrim(phone)) between 8 and 20),
  hotel_link text check (hotel_link is null or char_length(hotel_link) <= 500),
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  property_id uuid references public.properties (id) on delete set null,
  created_at timestamptz not null default now()
);
create index partner_applications_status_idx on public.partner_applications (status, created_at desc);

alter table public.bookings
  add column fulfillment_status text not null default 'awaiting'
    check (fulfillment_status in ('awaiting', 'confirmed', 'rejected', 'checked_in', 'completed', 'no_show')),
  add column hotel_note text,
  add column fulfillment_updated_at timestamptz;
create index bookings_hotel_place_idx on public.bookings (hotel_place_id, check_in);

-- Whether the caller manages the property a booking is for.
create function public.manages_hotel(p_hotel_place_id text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.property_managers pm
    join public.properties p on p.id = pm.property_id
    where pm.user_id = (select auth.uid()) and p.active and p.hotel_place_id = p_hotel_place_id
  )
$$;
revoke all on function public.manages_hotel(text) from public;
grant execute on function public.manages_hotel(text) to authenticated;

create function public.manages_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.property_managers where property_id = p_property_id and user_id = (select auth.uid()))
$$;
revoke all on function public.manages_property(uuid) from public;
grant execute on function public.manages_property(uuid) to authenticated;

-- Row access.
alter table public.properties enable row level security;
alter table public.property_managers enable row level security;
alter table public.partner_applications enable row level security;
revoke all on public.properties, public.property_managers, public.partner_applications from anon, authenticated;
grant select on public.properties, public.property_managers, public.partner_applications to authenticated;
grant insert (hotel_name, address, phone, hotel_link, message) on public.partner_applications to authenticated;

create policy properties_manager_select on public.properties for select to authenticated
  using ((select public.manages_property(id)) or (select public.is_admin()));
create policy property_managers_select on public.property_managers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.manages_property(property_id)) or (select public.is_admin()));
create policy partner_applications_own_select on public.partner_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy partner_applications_own_insert on public.partner_applications for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy bookings_manager_select on public.bookings for select to authenticated
  using ((select public.manages_hotel(hotel_place_id)));

-- One open application at a time, and it always starts pending.
create function public.partner_applications_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.partner_applications where user_id = new.user_id and status = 'pending') then
    raise exception 'application-pending' using errcode = '23505';
  end if;
  new.status := 'pending';
  new.review_note := null; new.reviewed_by := null; new.reviewed_at := null; new.property_id := null;
  new.created_at := now();
  return new;
end;
$$;
create trigger partner_applications_guard before insert on public.partner_applications
  for each row execute function public.partner_applications_guard();

-- The traveller's guard now also freezes the hotel's fields.
create or replace function public.bookings_guard_client_update()
returns trigger
language plpgsql
as $$
begin
  if not public.bookings_is_client_request() then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.total_price is distinct from old.total_price
     or new.price_per_night is distinct from old.price_per_night
     or new.nights is distinct from old.nights
     or new.check_in is distinct from old.check_in
     or new.check_out is distinct from old.check_out
     or new.hotel_place_id is distinct from old.hotel_place_id
     or new.room_key is distinct from old.room_key
     or new.payment_txn_ref is distinct from old.payment_txn_ref
     or new.payment_code is distinct from old.payment_code
     or new.payment_provider is distinct from old.payment_provider
     or new.paid_at is distinct from old.paid_at
     or new.fulfillment_status is distinct from old.fulfillment_status
     or new.hotel_note is distinct from old.hotel_note
     or new.fulfillment_updated_at is distinct from old.fulfillment_updated_at then
    raise exception 'bookings: these fields cannot be changed after booking'
      using errcode = '42501';
  end if;

  if new.payment_status is distinct from old.payment_status
     and not (old.payment_status = 'pending' and new.payment_status = 'cancelled') then
    raise exception 'bookings: payment status is set by the payment gateway'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.bookings_guard_client_insert()
returns trigger
language plpgsql
as $$
begin
  if public.bookings_is_client_request() then
    new.payment_status := 'pending';
    new.payment_txn_ref := null;
    new.paid_at := null;
    new.payment_code := 'FT' || upper(substr(md5(gen_random_uuid()::text), 1, 10));
    new.fulfillment_status := 'awaiting';
    new.hotel_note := null;
    new.fulfillment_updated_at := null;
  end if;
  return new;
end;
$$;

-- The hotel's side of a booking. Allowed moves:
--   awaiting  → confirmed (only once paid) | rejected
--   confirmed → checked_in (from the check-in date) | no_show (from the
--               check-in date) | rejected
--   checked_in → completed
-- Rejecting or marking a no-show needs a note; a traveller will ask why.
create function public.manager_set_fulfillment(p_booking_id uuid, p_status text, p_note text default '')
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into v from public.bookings where id = p_booking_id for update;
  if v.id is null then raise exception 'booking-not-found' using errcode = 'P0002'; end if;
  if not public.manages_hotel(v.hotel_place_id) then raise exception 'not-your-hotel' using errcode = '42501'; end if;
  if v.payment_status in ('cancelled', 'refunded', 'failed') then raise exception 'booking-closed' using errcode = '22023'; end if;
  if not (
    (v.fulfillment_status = 'awaiting' and p_status in ('confirmed', 'rejected'))
    or (v.fulfillment_status = 'confirmed' and p_status in ('checked_in', 'no_show', 'rejected'))
    or (v.fulfillment_status = 'checked_in' and p_status = 'completed')
  ) then
    raise exception 'transition-not-allowed: % -> %', v.fulfillment_status, p_status using errcode = '22023';
  end if;
  if p_status = 'confirmed' and v.payment_status <> 'paid' then raise exception 'not-paid-yet' using errcode = '22023'; end if;
  if p_status in ('checked_in', 'no_show') and v_today < v.check_in then raise exception 'before-check-in-date' using errcode = '22023'; end if;
  if p_status in ('rejected', 'no_show') and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note-required' using errcode = '22023'; end if;

  update public.bookings set
    fulfillment_status = p_status,
    hotel_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), hotel_note),
    fulfillment_updated_at = now()
  where id = p_booking_id;
  perform public.admin_log('hotel.' || p_status, 'bookings', p_booking_id::text,
    jsonb_build_object('from', v.fulfillment_status, 'to', p_status, 'note', btrim(coalesce(p_note, '')), 'hotel_place_id', v.hotel_place_id, 'hotel_name', v.hotel_name));
  return p_status;
end;
$$;
revoke all on function public.manager_set_fulfillment(uuid, text, text) from public, anon;
grant execute on function public.manager_set_fulfillment(uuid, text, text) to authenticated;

-- The contact details a manager keeps up to date themselves.
create function public.manager_update_property(p_property_id uuid, p_phone text, p_email text, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.property_managers where property_id = p_property_id and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'owners-only' using errcode = '42501';
  end if;
  update public.properties set
    phone = nullif(btrim(coalesce(p_phone, '')), ''), email = nullif(btrim(coalesce(p_email, '')), ''), note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_property_id;
end;
$$;
revoke all on function public.manager_update_property(uuid, text, text, text) from public, anon;
grant execute on function public.manager_update_property(uuid, text, text, text) to authenticated;

-- Admin: approve or reject an application. Approval creates the property (or
-- reuses the one already on that hotel id) and makes the applicant its owner.
create function public.admin_review_application(p_application_id uuid, p_approve boolean, p_hotel_place_id text default null, p_note text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.partner_applications%rowtype;
  v_property uuid;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  select * into v from public.partner_applications where id = p_application_id for update;
  if v.id is null then raise exception 'application-not-found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'application-already-reviewed' using errcode = '22023'; end if;

  if p_approve then
    if length(btrim(coalesce(p_hotel_place_id, ''))) = 0 then raise exception 'hotel-id-required' using errcode = '22023'; end if;
    insert into public.properties (hotel_place_id, name, address, phone)
      values (btrim(p_hotel_place_id), v.hotel_name, v.address, v.phone)
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
    jsonb_build_object('hotel_name', v.hotel_name, 'hotel_place_id', p_hotel_place_id, 'note', btrim(coalesce(p_note, ''))));
  return v_property;
end;
$$;
revoke all on function public.admin_review_application(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_review_application(uuid, boolean, text, text) to authenticated;

-- Admin: add a property directly, add or remove a manager by email.
create function public.admin_create_property(p_hotel_place_id text, p_name text, p_address text default null, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  insert into public.properties (hotel_place_id, name, address, phone)
    values (btrim(p_hotel_place_id), btrim(p_name), nullif(btrim(coalesce(p_address, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''))
    returning id into v_id;
  perform public.admin_log('property.created', 'properties', v_id::text, jsonb_build_object('hotel_name', p_name, 'hotel_place_id', p_hotel_place_id));
  return v_id;
end;
$$;
revoke all on function public.admin_create_property(text, text, text, text) from public, anon;
grant execute on function public.admin_create_property(text, text, text, text) to authenticated;

create function public.admin_set_property_manager(p_property_id uuid, p_email text, p_role text default 'owner')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then raise exception 'user-not-found' using errcode = 'P0002'; end if;
  if p_role = 'none' then
    delete from public.property_managers where property_id = p_property_id and user_id = v_user;
  else
    if p_role not in ('owner', 'staff') then raise exception 'bad-role' using errcode = '22023'; end if;
    insert into public.property_managers (property_id, user_id, role) values (p_property_id, v_user, p_role)
      on conflict (property_id, user_id) do update set role = excluded.role;
  end if;
  perform public.admin_log('property.manager.' || p_role, 'properties', p_property_id::text, jsonb_build_object('email', lower(btrim(p_email))));
  return v_user;
end;
$$;
revoke all on function public.admin_set_property_manager(uuid, text, text) from public, anon;
grant execute on function public.admin_set_property_manager(uuid, text, text) to authenticated;

-- Admin: properties with their managers' emails (auth.users is not readable
-- from the browser) and booking counts.
create function public.admin_list_properties()
returns table (id uuid, hotel_place_id text, name text, address text, phone text, active boolean, created_at timestamptz,
  managers jsonb, bookings bigint, awaiting bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return query
    select p.id, p.hotel_place_id, p.name, p.address, p.phone, p.active, p.created_at,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email, 'role', pm.role) order by pm.role, u.email)
        from public.property_managers pm join auth.users u on u.id = pm.user_id where pm.property_id = p.id), '[]'::jsonb),
      (select count(*) from public.bookings b where b.hotel_place_id = p.hotel_place_id),
      (select count(*) from public.bookings b where b.hotel_place_id = p.hotel_place_id and b.payment_status = 'paid' and b.fulfillment_status = 'awaiting')
    from public.properties p
    order by p.created_at desc;
end;
$$;
revoke all on function public.admin_list_properties() from public, anon;
grant execute on function public.admin_list_properties() to authenticated;

-- Applications with the applicant's email, for the admin's review list.
create function public.admin_list_applications(p_status text default 'pending')
returns table (id uuid, user_id uuid, email text, hotel_name text, address text, phone text, hotel_link text, message text,
  status text, review_note text, created_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return query
    select a.id, a.user_id, u.email::text, a.hotel_name, a.address, a.phone, a.hotel_link, a.message, a.status, a.review_note, a.created_at, a.reviewed_at
    from public.partner_applications a left join auth.users u on u.id = a.user_id
    where p_status = 'all' or a.status = p_status
    order by a.created_at desc
    limit 200;
end;
$$;
revoke all on function public.admin_list_applications(text) from public, anon;
grant execute on function public.admin_list_applications(text) to authenticated;

-- The overview also counts partner applications waiting for review, and paid
-- bookings a hotel rejected — those need a refund.
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not-admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'bookings', coalesce((select jsonb_object_agg(payment_status, n) from (
      select payment_status, count(*) as n from public.bookings group by payment_status) s), '{}'::jsonb),
    'revenue_paid', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'paid'),
    'revenue_30d', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'paid' and paid_at > now() - interval '30 days'),
    'pending_amount', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'pending'),
    'refunded_amount', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'refunded'),
    'payments_attention', (select count(*) from public.payment_transactions where outcome in ('underpaid', 'no-booking', 'not-pending', 'wrong-account')),
    'partner_applications', (select count(*) from public.partner_applications where status = 'pending'),
    'hotel_rejected_paid', (select count(*) from public.bookings where payment_status = 'paid' and fulfillment_status = 'rejected'),
    'posts', (select count(*) from public.community_posts),
    'comments', (select count(*) from public.community_comments),
    'messages_open', (select count(*) from public.contact_messages where handled_at is null),
    'subscribers', (select count(*) from public.newsletter_subscribers),
    'video_reviews', (select count(*) from public.video_reviews),
    'itineraries', (select count(*) from public.itineraries),
    'saved_places', (select count(*) from public.saved_places),
    'by_day', (select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'signups', (select count(*) from auth.users u where u.created_at >= d and u.created_at < d + interval '1 day'),
        'bookings', (select count(*) from public.bookings b where b.created_at >= d and b.created_at < d + interval '1 day'),
        'revenue', (select coalesce(sum(b.total_price), 0) from public.bookings b where b.payment_status = 'paid' and b.paid_at >= d and b.paid_at < d + interval '1 day')
      ) order by d)
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as d)
  );
end;
$$;

commit;
