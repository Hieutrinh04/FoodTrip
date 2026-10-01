-- What an admin can do beyond reading and deleting, and a record of it.
--
-- Every action that moves money or grants power goes through a function here
-- that checks public.is_admin() itself and writes admin_audit in the same
-- transaction, so there is no way to take the action without leaving the
-- record. Deletions made through the ordinary table API (moderation) are
-- logged by triggers.
--
--   admin_set_booking_status   pending → paid (money received outside the
--                              webhook: a mistyped transfer note, cash),
--                              pending → cancelled, paid → refunded
--   admin_match_payment        attach a bank transfer SePay could not match
--                              to its booking, which marks the booking paid
--   admin_set_admin            grant or withdraw admin rights

begin;

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'cancelled', 'refunded'));

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
grant select on public.admin_audit to authenticated;
create policy admin_audit_admin_select on public.admin_audit for select to authenticated
  using ((select public.is_admin()));

create or replace function public.admin_log(p_action text, p_table text, p_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.admin_audit (actor, actor_email, action, target_table, target_id, details)
  values ((select auth.uid()), (select email from auth.users where id = (select auth.uid())), p_action, p_table, p_id, coalesce(p_details, '{}'::jsonb))
$$;
revoke all on function public.admin_log(text, text, text, jsonb) from public, anon, authenticated;

-- Who counts as "the client" for the bookings guard: the role running the
-- statement. A request from the browser runs as anon or authenticated; the
-- webhook runs as service_role; the admin functions below are security
-- definer, so inside them the statement runs as their owner — and they check
-- is_admin() before doing anything. It used to ask auth.role(), which is the
-- same "authenticated" inside those functions, so they could not have been
-- told apart from the browser without a flag a client might set too.
create or replace function public.bookings_is_client_request()
returns boolean
language sql
stable
as $$
  select current_user in ('anon', 'authenticated')
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

create or replace function public.admin_set_booking_status(p_booking_id uuid, p_status text, p_note text default '')
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_old text;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  select payment_status into v_old from public.bookings where id = p_booking_id for update;
  if v_old is null then raise exception 'booking-not-found' using errcode = 'P0002'; end if;
  if not ((v_old = 'pending' and p_status in ('paid', 'cancelled')) or (v_old = 'paid' and p_status = 'refunded')) then
    raise exception 'transition-not-allowed: % -> %', v_old, p_status using errcode = '22023';
  end if;
  -- Money taken by hand needs a word on how, for whoever reconciles later.
  if p_status in ('paid', 'refunded') and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note-required' using errcode = '22023';
  end if;

  update public.bookings set
    payment_status = p_status,
    payment_provider = case when p_status = 'paid' then 'manual' else payment_provider end,
    payment_txn_ref = case when p_status = 'paid' then 'MANUAL' else payment_txn_ref end,
    paid_at = case when p_status = 'paid' then now() else paid_at end
  where id = p_booking_id;
  perform public.admin_log('booking.' || p_status, 'bookings', p_booking_id::text,
    jsonb_build_object('from', v_old, 'to', p_status, 'note', btrim(coalesce(p_note, ''))));
  return p_status;
end;
$$;
revoke all on function public.admin_set_booking_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_booking_status(uuid, text, text) to authenticated;

create or replace function public.admin_match_payment(p_transaction_id bigint, p_payment_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  select * into v_tx from public.payment_transactions where id = p_transaction_id for update;
  if v_tx.id is null then raise exception 'transaction-not-found' using errcode = 'P0002'; end if;
  if v_tx.outcome not in ('no-booking', 'underpaid') then
    raise exception 'transaction-already-handled: %', v_tx.outcome using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where payment_code = upper(btrim(p_payment_code)) for update;
  if v_booking.id is null then raise exception 'booking-not-found' using errcode = 'P0002'; end if;
  if v_booking.payment_status <> 'pending' then raise exception 'booking-not-pending' using errcode = '22023'; end if;
  if v_tx.amount < v_booking.total_price then raise exception 'amount-too-small' using errcode = '22023'; end if;

  update public.bookings set
    payment_status = 'paid', payment_provider = 'sepay',
    payment_txn_ref = 'SEPAY-' || v_tx.id, paid_at = coalesce(v_tx.transaction_date, now())
  where id = v_booking.id;
  update public.payment_transactions set outcome = 'paid', booking_id = v_booking.id where id = v_tx.id;
  perform public.admin_log('payment.matched', 'payment_transactions', v_tx.id::text,
    jsonb_build_object('booking_id', v_booking.id, 'payment_code', v_booking.payment_code, 'amount', v_tx.amount));
  return 'paid';
end;
$$;
revoke all on function public.admin_match_payment(bigint, text) from public, anon;
grant execute on function public.admin_match_payment(bigint, text) to authenticated;

create or replace function public.admin_set_admin(p_user_id uuid, p_admin boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  -- Nobody locks themselves out, so there is always at least one admin.
  if not p_admin and p_user_id = (select auth.uid()) then raise exception 'cannot-remove-self' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'user-not-found' using errcode = 'P0002'; end if;
  if p_admin then
    insert into public.admin_users (user_id) values (p_user_id) on conflict do nothing;
  else
    delete from public.admin_users where user_id = p_user_id;
  end if;
  perform public.admin_log(case when p_admin then 'admin.granted' else 'admin.revoked' end, 'admin_users', p_user_id::text,
    jsonb_build_object('email', (select email from auth.users where id = p_user_id)));
  return p_admin;
end;
$$;
revoke all on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;

-- Moderation deletes go through the table API; a trigger records the ones an
-- admin makes (not an owner deleting their own post), with enough of the row
-- to know what was removed.
create or replace function public.admin_log_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(old);
begin
  if public.is_admin() and (v_row->>'user_id') is distinct from (select auth.uid())::text then
    perform public.admin_log('delete', tg_table_name, coalesce(v_row->>'id', ''),
      v_row - 'embed_html' - 'photo_paths' - 'data');
  end if;
  return old;
end;
$$;

drop trigger if exists community_posts_admin_log on public.community_posts;
create trigger community_posts_admin_log after delete on public.community_posts for each row execute function public.admin_log_delete();
drop trigger if exists community_comments_admin_log on public.community_comments;
create trigger community_comments_admin_log after delete on public.community_comments for each row execute function public.admin_log_delete();
drop trigger if exists video_reviews_admin_log on public.video_reviews;
create trigger video_reviews_admin_log after delete on public.video_reviews for each row execute function public.admin_log_delete();
drop trigger if exists contact_messages_admin_log on public.contact_messages;
create trigger contact_messages_admin_log after delete on public.contact_messages for each row execute function public.admin_log_delete();
drop trigger if exists newsletter_subscribers_admin_log on public.newsletter_subscribers;
create trigger newsletter_subscribers_admin_log after delete on public.newsletter_subscribers for each row execute function public.admin_log_delete();

-- An admin cancels a booking through admin_set_booking_status, which logs it;
-- the table API is left to travellers cancelling their own.

-- The overview, now with money: revenue and bookings per day for two weeks,
-- what is waiting to be paid, and transfers that need a human.
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
