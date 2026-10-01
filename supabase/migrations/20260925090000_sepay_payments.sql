-- Paying for a booking by bank transfer through SePay.
--
-- The traveller transfers the booking's total with its payment code in the
-- transfer note; SePay watches the bank account and calls the sepay-webhook
-- Edge Function for every incoming transfer, which matches the code to a
-- booking and marks it paid.
--
-- payment_code   short, bank-safe code for the transfer note: "FT" + 10 hex
--                characters. Banks upper-case notes and strip punctuation, so
--                it uses nothing else. Set by the database, never the browser.
-- paid_at        when the money arrived.
-- payment_transactions
--                every transfer SePay reports, matched or not, keyed by
--                SePay's own id: a redelivered webhook hits the same row
--                instead of paying twice. Unmatched and short payments stay
--                here for an admin to reconcile; no client can read it.

begin;

alter table public.bookings add column if not exists payment_code text;
alter table public.bookings add column if not exists paid_at timestamptz;
update public.bookings
  set payment_code = 'FT' || upper(substr(md5(id::text), 1, 10))
  where payment_code is null;
alter table public.bookings
  alter column payment_code set default ('FT' || upper(substr(md5(gen_random_uuid()::text), 1, 10))),
  alter column payment_code set not null;
create unique index if not exists bookings_payment_code_key on public.bookings (payment_code);

-- A client insert gets a fresh code whatever it sent, so nobody can pick
-- another booking's code — or a guessable one.
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
  end if;
  return new;
end;
$$;

-- As before, plus the payment code, provider and payment time: all of them
-- are written by the payment functions (service role), never by the browser.
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
     or new.paid_at is distinct from old.paid_at then
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

create table if not exists public.payment_transactions (
  id bigint primary key,
  provider text not null default 'sepay',
  booking_id uuid references public.bookings (id) on delete set null,
  payment_code text,
  amount bigint not null,
  content text,
  reference_code text,
  account_number text,
  gateway text,
  transaction_date timestamptz,
  -- paid | underpaid | no-booking | not-pending | outgoing | wrong-account
  outcome text not null,
  raw jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_transactions_booking_idx on public.payment_transactions (booking_id);
create index if not exists payment_transactions_created_idx on public.payment_transactions (created_at desc);
alter table public.payment_transactions enable row level security;
revoke all on public.payment_transactions from anon, authenticated;
grant select on public.payment_transactions to authenticated;
create policy payment_transactions_admin_select on public.payment_transactions for select to authenticated
  using ((select public.is_admin()));

commit;
