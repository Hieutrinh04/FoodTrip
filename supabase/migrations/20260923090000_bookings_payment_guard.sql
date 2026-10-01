-- Payment status and money fields are set by the payment gateway, not the browser.
--
-- The owner-update policy on bookings allowed any column to change, so a
-- signed-in user could set their own booking's payment_status to 'paid' (the
-- demo button did exactly that) or rewrite total_price after booking. The
-- policy's comment said "owner can only cancel", but nothing enforced it.
--
-- These triggers enforce it for requests made with a user's (or the anon) key.
-- Edge Functions use the service role and pass through; so do direct database
-- sessions, which carry no request JWT at all.

create or replace function public.bookings_is_client_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') in ('anon', 'authenticated')
$$;

create or replace function public.bookings_guard_client_insert()
returns trigger
language plpgsql
as $$
begin
  if public.bookings_is_client_request() then
    -- A new booking always starts unpaid, whatever the request said.
    new.payment_status := 'pending';
    new.payment_txn_ref := null;
  end if;
  return new;
end;
$$;

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
     or new.payment_txn_ref is distinct from old.payment_txn_ref then
    raise exception 'bookings: these fields cannot be changed after booking'
      using errcode = '42501';
  end if;

  -- The only status change a customer may make is cancelling an unpaid booking.
  if new.payment_status is distinct from old.payment_status
     and not (old.payment_status = 'pending' and new.payment_status = 'cancelled') then
    raise exception 'bookings: payment status is set by the payment gateway'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_guard_client_insert on public.bookings;
create trigger bookings_guard_client_insert
  before insert on public.bookings
  for each row execute function public.bookings_guard_client_insert();

drop trigger if exists bookings_guard_client_update on public.bookings;
create trigger bookings_guard_client_update
  before update on public.bookings
  for each row execute function public.bookings_guard_client_update();
