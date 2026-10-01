-- Opt-in, server-priced partner inventory. Existing properties are unchanged
-- until their owner explicitly enables inventory after reconciling old orders.
begin;
-- Fail safely instead of holding up live booking requests during deployment.
set local lock_timeout = '5s';
set local statement_timeout = '120s';
alter table public.properties add column inventory_enabled boolean not null default false;
alter table public.bookings add column inventory_request_key uuid;
create unique index inventory_booking_request on public.bookings(user_id,inventory_request_key) where inventory_request_key is not null;
create table public.room_inventory (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  name text not null check (length(btrim(name)) between 2 and 150),
  capacity int not null check (capacity between 1 and 20),
  quantity int not null check (quantity between 1 and 1000),
  nightly_price bigint not null check (nightly_price between 1000 and 100000000),
  active boolean not null default true
);
create index room_inventory_property_idx on public.room_inventory(property_id);
create table public.room_calendar (
  room_id uuid not null references public.room_inventory(id),
  stay_date date not null,
  quantity int not null check (quantity between 0 and 1000),
  nightly_price bigint not null check (nightly_price between 1000 and 100000000),
  primary key(room_id, stay_date)
);
alter table public.room_inventory enable row level security;
alter table public.room_calendar enable row level security;
revoke all on public.room_inventory, public.room_calendar from anon, authenticated;
grant select on public.room_inventory, public.room_calendar to authenticated;
create policy room_managers_read on public.room_inventory for select to authenticated
using (public.manages_property(property_id) or public.is_admin());
create policy calendar_managers_read on public.room_calendar for select to authenticated
using (exists(select 1 from public.room_inventory r where r.id = room_id and public.manages_property(r.property_id)) or public.is_admin());

create function public.inventory_owner(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.property_managers m join public.properties p on p.id = m.property_id
    where m.property_id = p_property and m.user_id = auth.uid() and m.role = 'owner' and p.active)
$$;
revoke all on function public.inventory_owner(uuid) from public;
grant execute on function public.inventory_owner(uuid) to authenticated;

-- Count one room per booking. Pending orders hold inventory until explicitly
-- cancelled, avoiding release while a bank transfer may still be in flight.
create function public.room_reserved(p_room uuid, p_day date, p_except uuid default null) returns int
-- VOLATILE: capacity checks must see rows inserted by earlier trigger calls
-- and a fresh snapshot after waiting for the room lock.
language sql volatile security definer set search_path = '' as $$
  select count(*)::int from public.bookings b join public.room_inventory r on r.id = p_room
    join public.properties p on p.id = r.property_id
  where b.hotel_place_id = p.hotel_place_id and b.room_key = r.id::text
    and b.check_in <= p_day and b.check_out > p_day
    and b.payment_status in ('pending', 'paid')
    and b.fulfillment_status not in ('rejected', 'no_show')
    and (p_except is null or b.id <> p_except)
$$;
revoke all on function public.room_reserved(uuid,date,uuid) from public;

create function public.manager_save_room(p_property uuid, p_name text, p_capacity int, p_quantity int, p_price bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.inventory_owner(p_property) then raise exception 'owners-only'; end if;
  insert into public.room_inventory(property_id,name,capacity,quantity,nightly_price)
    values(p_property,btrim(p_name),p_capacity,p_quantity,p_price) returning id into v_id;
  perform public.admin_log('inventory.room_created','room_inventory',v_id::text);
  return v_id;
end $$;
revoke all on function public.manager_save_room(uuid,text,int,int,bigint) from public;
grant execute on function public.manager_save_room(uuid,text,int,int,bigint) to authenticated;

create function public.manager_set_room_dates(p_room uuid,p_start date,p_end date,p_quantity int,p_price bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.room_inventory; d date;
begin
  select * into r from public.room_inventory where id=p_room for update;
  if r.id is null or not public.inventory_owner(r.property_id) then raise exception 'owners-only'; end if;
  if p_start is null or p_end is null or p_start < (now() at time zone 'Asia/Ho_Chi_Minh')::date
    or p_end < p_start or p_end-p_start > 365 then raise exception 'invalid-dates'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > r.quantity then raise exception 'invalid-quantity'; end if;
  for d in select generate_series(p_start,p_end,interval '1 day')::date loop
    if p_quantity < public.room_reserved(r.id,d) then raise exception 'below-reserved-quantity'; end if;
    insert into public.room_calendar values(r.id,d,p_quantity,p_price)
      on conflict(room_id,stay_date) do update set quantity=excluded.quantity,nightly_price=excluded.nightly_price;
  end loop;
  perform public.admin_log('inventory.calendar_updated','room_inventory',r.id::text,
    jsonb_build_object('from',p_start,'to',p_end,'quantity',p_quantity,'price',p_price));
end $$;
revoke all on function public.manager_set_room_dates(uuid,date,date,int,bigint) from public;
grant execute on function public.manager_set_room_dates(uuid,date,date,int,bigint) to authenticated;

create function public.manager_enable_inventory(p_property uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.properties;
begin
  select * into p from public.properties where id=p_property for update;
  if not public.inventory_owner(p_property) then raise exception 'owners-only'; end if;
  if not exists(select 1 from public.room_inventory where property_id=p.id and active) then raise exception 'rooms-required'; end if;
  if exists(select 1 from public.bookings b where b.hotel_place_id=p.hotel_place_id
    and b.check_out > (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and b.payment_status in ('pending','paid') and b.fulfillment_status not in ('rejected','no_show')
    and not exists(select 1 from public.room_inventory r where r.property_id=p.id and r.id::text=b.room_key))
    then raise exception 'legacy-bookings-need-reconciliation'; end if;
  update public.properties set inventory_enabled=true where id=p.id;
  perform public.admin_log('inventory.enabled','properties',p.id::text);
end $$;
revoke all on function public.manager_enable_inventory(uuid) from public;
grant execute on function public.manager_enable_inventory(uuid) to authenticated;

-- Public catalogue exposes prices/counts, never bookings or guest details.
create function public.hotel_room_quote(p_hotel text,p_in date,p_out date,p_guests int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.properties; result jsonb;
begin
  select * into p from public.properties where hotel_place_id=p_hotel;
  if p.id is null or not p.inventory_enabled then return jsonb_build_object('managed',false,'rooms','[]'::jsonb); end if;
  if p_in is null or p_out is null or p_in < (now() at time zone 'Asia/Ho_Chi_Minh')::date
    or p_out<=p_in or p_out-p_in>30 or p_guests is null or p_guests not between 1 and 20 then raise exception 'invalid-dates'; end if;
  select coalesce(jsonb_agg(q),'[]'::jsonb) into result from (
    select r.id,r.name,r.capacity,sum(coalesce(c.nightly_price,r.nightly_price))::bigint as total_price,
      min(greatest(0,coalesce(c.quantity,r.quantity)-public.room_reserved(r.id,d::date)))::int as rooms_left
    from public.room_inventory r cross join generate_series(p_in,p_out-1,interval '1 day') d
    left join public.room_calendar c on c.room_id=r.id and c.stay_date=d::date
    where r.property_id=p.id and r.active and p.active and r.capacity>=p_guests
    group by r.id order by r.nightly_price,r.id
  ) q;
  return jsonb_build_object('managed',true,'rooms',result);
end $$;
revoke all on function public.hotel_room_quote(text,date,date,int) from public;
grant execute on function public.hotel_room_quote(text,date,date,int) to anon,authenticated;

create function public.guard_inventory_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.properties; r public.room_inventory; d date; stock int; price bigint; total bigint:=0;
begin
  -- Serialize activation with legacy inserts; serialize reservations on room.
  select * into p from public.properties where hotel_place_id=new.hotel_place_id for share;
  if p.id is null or not p.inventory_enabled then return new; end if;
  if TG_OP='UPDATE' then
    if (new.hotel_place_id,new.room_key,new.check_in,new.check_out,new.guests,new.total_price,new.price_per_night,new.nights,new.inventory_request_key)
       is distinct from (old.hotel_place_id,old.room_key,old.check_in,old.check_out,old.guests,old.total_price,old.price_per_night,old.nights,old.inventory_request_key)
       then raise exception 'inventory-booking-immutable'; end if;
    -- Releases need no capacity check. Reopening a released order does.
    if new.payment_status not in ('pending','paid') or new.fulfillment_status in ('rejected','no_show') then return new; end if;
    if old.payment_status in ('pending','paid') and old.fulfillment_status not in ('rejected','no_show') then return new; end if;
  end if;
  select * into r from public.room_inventory where property_id=p.id and id::text=new.room_key for update;
  if r.id is null or not r.active or not p.active then raise exception 'room-unavailable'; end if;
  if new.check_in is null or new.check_out is null or new.check_in<(now() at time zone 'Asia/Ho_Chi_Minh')::date
    or new.check_out<=new.check_in or new.check_out-new.check_in>30 or new.guests not between 1 and r.capacity then raise exception 'invalid-dates'; end if;
  for d in select generate_series(new.check_in,new.check_out-1,interval '1 day')::date loop
    select c.quantity,c.nightly_price into stock,price from public.room_calendar c where c.room_id=r.id and c.stay_date=d;
    stock:=coalesce(stock,r.quantity); price:=coalesce(price,r.nightly_price);
    if public.room_reserved(r.id,d,new.id)>=stock then raise exception 'room-sold-out'; end if;
    total:=total+price;
  end loop;
  if TG_OP='INSERT' then
    if new.total_price is distinct from total then raise exception 'price-changed'; end if;
    new.hotel_name:=p.name; new.hotel_address:=p.address; new.room_name:=r.name;
    new.nights:=new.check_out-new.check_in; new.total_price:=total;
    new.price_per_night:=round(total::numeric/new.nights);
  end if;
  return new;
end $$;
revoke all on function public.guard_inventory_booking() from public;
create trigger zz_inventory_booking before insert or update on public.bookings
for each row execute function public.guard_inventory_booking();

create function public.reserve_partner_room(p_room uuid,p_in date,p_out date,p_guests int,p_name text,p_phone text,p_email text,p_total bigint,p_key uuid)
returns public.bookings language plpgsql security definer set search_path='' as $$
declare r public.room_inventory; p public.properties; b public.bookings;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if p_key is null or length(btrim(coalesce(p_name,''))) not between 2 and 150
    or length(coalesce(p_phone,''))>30 or length(coalesce(p_email,''))>320 then raise exception 'invalid-guest'; end if;
  -- Same lock order as the insert trigger: property, then room.
  select pr.* into p from public.properties pr join public.room_inventory ri on ri.property_id=pr.id where ri.id=p_room for share of pr;
  select * into r from public.room_inventory where id=p_room for update;
  if r.id is null or not coalesce(p.inventory_enabled,false) then raise exception 'room-unavailable'; end if;
  select * into b from public.bookings where user_id=auth.uid() and inventory_request_key=p_key;
  if b.id is not null then
    if (b.room_key,b.check_in,b.check_out,b.guests) is distinct from (p_room::text,p_in,p_out,p_guests) then raise exception 'request-key-conflict'; end if;
    return b;
  end if;
  insert into public.bookings(user_id,hotel_place_id,hotel_name,room_key,room_name,price_per_night,
    check_in,check_out,nights,guests,total_price,guest_name,guest_phone,guest_email,payment_status,inventory_request_key)
  values(auth.uid(),p.hotel_place_id,p.name,r.id::text,r.name,r.nightly_price,p_in,p_out,p_out-p_in,p_guests,p_total,
    btrim(p_name),nullif(btrim(p_phone),''),nullif(btrim(p_email),''),'pending',p_key) returning * into b;
  return b;
end $$;
revoke all on function public.reserve_partner_room(uuid,date,date,int,text,text,text,bigint,uuid) from public;
grant execute on function public.reserve_partner_room(uuid,date,date,int,text,text,text,bigint,uuid) to authenticated;
commit;
