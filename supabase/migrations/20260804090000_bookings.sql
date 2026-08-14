-- Room booking flow ("book a hotel like Agoda/Traveloka"). Google Places
-- doesn't expose per-room pricing/inventory, so room types + nightly prices
-- are generated deterministically client-side from the hotel's Google place
-- id (see src/lib/roomTypes.js) — this table stores the *booking*, not the
-- room catalog itself, which doesn't need persistence.
--
-- Payment is a VNPay sandbox integration: the app writes a 'pending' row,
-- redirects to VNPay, and the vnpay-return Edge Function (using the service
-- role, since VNPay's redirect carries no Supabase auth) flips the status
-- to 'paid'/'failed' after verifying VNPay's signed callback.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hotel_place_id text not null,
  hotel_name text not null,
  hotel_address text,
  room_key text not null,
  room_name text not null,
  price_per_night bigint not null,
  check_in date not null,
  check_out date not null,
  nights int not null,
  guests int not null,
  total_price bigint not null,
  guest_name text not null,
  guest_email text,
  guest_phone text,
  payment_provider text not null default 'vnpay',
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cancelled')),
  payment_txn_ref text,
  created_at timestamptz not null default now()
);

create index if not exists bookings_user_id_idx on public.bookings (user_id);

alter table public.bookings enable row level security;

create policy "bookings_owner_select" on public.bookings
  for select using (auth.uid() = user_id);

create policy "bookings_owner_insert" on public.bookings
  for insert with check (auth.uid() = user_id);

-- Owner can only cancel (or otherwise touch) their own booking from the
-- client; the paid/failed transition is done server-side by vnpay-return
-- using the service role, which bypasses RLS entirely.
create policy "bookings_owner_update" on public.bookings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
