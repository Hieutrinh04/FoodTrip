-- Complete the room lifecycle without deleting bookings or repricing them.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function public.manager_update_room(p_room uuid,p_name text,p_capacity int,p_quantity int,p_price bigint,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.room_inventory; today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into r from public.room_inventory where id=p_room for update;
  if r.id is null or not public.inventory_owner(r.property_id) then raise exception 'owners-only'; end if;
  if p_active is null then raise exception 'invalid-status'; end if;
  -- A calendar override must never exceed the physical room count.
  if exists(select 1 from public.room_calendar where room_id=r.id and stay_date>=today and quantity>p_quantity)
    then raise exception 'calendar-exceeds-quantity'; end if;
  if exists(select 1 from public.bookings b join public.properties p on p.hotel_place_id=b.hotel_place_id
      where p.id=r.property_id and b.room_key=r.id::text and b.check_out>today
      and b.payment_status in ('pending','paid') and b.fulfillment_status not in ('rejected','no_show')
      and b.guests>p_capacity) then raise exception 'capacity-below-booked-guests'; end if;
  -- Check only occupied nights without overrides: those use the new default.
  if exists(select 1 from (
      select d::date as stay_date,count(*) as reserved
      from public.bookings b join public.properties p on p.hotel_place_id=b.hotel_place_id
      cross join lateral generate_series(greatest(b.check_in,today),b.check_out-1,interval '1 day') d
      where p.id=r.property_id and b.room_key=r.id::text
        and b.payment_status in ('pending','paid') and b.fulfillment_status not in ('rejected','no_show')
      group by d::date
    ) occupied where occupied.reserved>p_quantity and not exists(
      select 1 from public.room_calendar c where c.room_id=r.id and c.stay_date=occupied.stay_date))
    then raise exception 'below-reserved-quantity'; end if;
  update public.room_inventory set name=btrim(p_name),capacity=p_capacity,quantity=p_quantity,
    nightly_price=p_price,active=p_active where id=r.id;
  perform public.admin_log('inventory.room_updated','room_inventory',r.id::text,
    jsonb_build_object('active',p_active,'capacity',p_capacity,'quantity',p_quantity,'price',p_price));
end $$;
revoke all on function public.manager_update_room(uuid,text,int,int,bigint,boolean) from public,anon;
grant execute on function public.manager_update_room(uuid,text,int,int,bigint,boolean) to authenticated;

create function public.manager_reset_room_dates(p_room uuid,p_start date,p_end date)
returns void language plpgsql security definer set search_path='' as $$
declare r public.room_inventory; d date;
begin
  select * into r from public.room_inventory where id=p_room for update;
  if r.id is null or not public.inventory_owner(r.property_id) then raise exception 'owners-only'; end if;
  if p_start is null or p_end is null or p_start<(now() at time zone 'Asia/Ho_Chi_Minh')::date
    or p_end<p_start or p_end-p_start>365 then raise exception 'invalid-dates'; end if;
  for d in select generate_series(p_start,p_end,interval '1 day')::date loop
    if public.room_reserved(r.id,d)>r.quantity then raise exception 'below-reserved-quantity'; end if;
  end loop;
  delete from public.room_calendar where room_id=r.id and stay_date between p_start and p_end;
  perform public.admin_log('inventory.calendar_reset','room_inventory',r.id::text,
    jsonb_build_object('from',p_start,'to',p_end));
end $$;
revoke all on function public.manager_reset_room_dates(uuid,date,date) from public,anon;
grant execute on function public.manager_reset_room_dates(uuid,date,date) to authenticated;
notify pgrst, 'reload schema';
commit;
