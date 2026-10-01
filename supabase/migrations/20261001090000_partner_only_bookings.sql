-- Only partner hotels take bookings and payment on FoodTrip. A hotel found by
-- search but not run by a partner used to get generated rooms and prices, and
-- a traveller could pay FoodTrip for a room nobody at the hotel knew about.
-- A hotel takes bookings when it is an active partner property with its own
-- room inventory switched on (real rooms, real prices, someone to confirm).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function public.hotel_takes_bookings(p_hotel text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.properties p where p.hotel_place_id = p_hotel and p.active and p.inventory_enabled)
$$;
revoke all on function public.hotel_takes_bookings(text) from public, anon;
grant execute on function public.hotel_takes_bookings(text) to authenticated;

-- For the hotel cards: which of these hotels can be booked here, with the
-- name and address the partner registered (so a booking link works on its
-- own, without the search result that led to it).
create function public.hotel_booking_status(p_ids text[]) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('hotel_place_id', p.hotel_place_id, 'name', p.name, 'address', p.address)), '[]'::jsonb)
  from public.properties p
  where p.hotel_place_id = any(coalesce(p_ids[1:300], '{}')) and p.active and p.inventory_enabled
$$;
revoke all on function public.hotel_booking_status(text[]) from public;
grant execute on function public.hotel_booking_status(text[]) to anon, authenticated;

-- Runs as the caller (not security definer) so bookings_is_client_request()
-- still sees the API role; the server's own writes are not affected.
create function public.guard_partner_only_booking() returns trigger
language plpgsql set search_path='' as $$
begin
  if public.bookings_is_client_request() and not public.hotel_takes_bookings(new.hotel_place_id) then
    raise exception 'hotel-not-bookable';
  end if;
  return new;
end $$;
revoke all on function public.guard_partner_only_booking() from public, anon, authenticated;

create trigger bookings_partner_only before insert on public.bookings
  for each row execute function public.guard_partner_only_booking();

notify pgrst, 'reload schema';
commit;
