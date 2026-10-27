-- Three things a live marketplace needs and FoodTrip lacked:
--   1. Notifications. Every event that someone has to act on or wants to know
--      about is written to `notifications` by the database itself (so no path
--      can forget it): in-app at once, and by email when an email provider is
--      configured (the send-notifications function delivers them).
--   2. Scheduled jobs (pg_cron): unpaid bookings stop holding rooms after 30
--      minutes, tour requests nobody confirmed are released after 48 hours,
--      reminders go out, and the email queue is drained every minute.
--   3. Cancellation and refunds by policy: a guest can cancel a paid booking;
--      the refund follows the property's cancellation policy; admins work a
--      refund queue; any amount the property keeps is still paid out to it.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------- 1. Notifications

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) <= 60),
  ref text check (ref is null or char_length(ref) <= 120),
  title text not null check (char_length(title) <= 200),
  body text not null check (char_length(body) <= 1000),
  link text check (link is null or char_length(link) <= 300),
  read_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  email_attempts int not null default 0,
  email_error text,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_email_queue_idx on public.notifications (created_at) where email_status = 'pending';
create index notifications_ref_idx on public.notifications (kind, ref);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text default null, p_ref text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link, ref)
  select p_user, p_kind, left(p_title, 200), left(p_body, 1000), p_link, p_ref where p_user is not null
$$;
revoke all on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;

create function public.notify_property(p_hotel text, p_kind text, p_title text, p_body text, p_ref text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link, ref)
  select m.user_id, p_kind, left(p_title, 200), left(p_body, 1000), '/partner?tab=bookings', p_ref
  from public.property_managers m join public.properties p on p.id = m.property_id where p.hotel_place_id = p_hotel
$$;
revoke all on function public.notify_property(text, text, text, text, text) from public, anon, authenticated;

create function public.notify_operator(p_operator uuid, p_kind text, p_title text, p_body text, p_link text, p_ref text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link, ref)
  select m.user_id, p_kind, left(p_title, 200), left(p_body, 1000), p_link, p_ref
  from public.tour_members m where m.operator_id = p_operator and m.role in ('owner', 'manager')
$$;
revoke all on function public.notify_operator(uuid, text, text, text, text, text) from public, anon, authenticated;

create function public.notify_admins(p_kind text, p_title text, p_body text, p_link text default '/admin', p_ref text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link, ref)
  select a.user_id, p_kind, left(p_title, 200), left(p_body, 1000), p_link, p_ref from public.admin_users a
$$;
revoke all on function public.notify_admins(text, text, text, text, text) from public, anon, authenticated;

create function public.vnd(p bigint) returns text language sql immutable set search_path = '' as $$
  select replace(to_char(coalesce(p, 0), 'FM999G999G999G999'), ',', '.') || 'đ'
$$;

-- ---------------------------------------------------------------- 3a. Refund columns (needed by the triggers below)

alter table public.bookings
  add column cancelled_at timestamptz,
  add column cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  add column refund_amount bigint not null default 0 check (refund_amount >= 0),
  add column refund_status text not null default 'none' check (refund_status in ('none', 'pending', 'completed')),
  add column refund_bank text check (refund_bank is null or char_length(refund_bank) <= 100),
  add column refund_account text check (refund_account is null or refund_account ~ '^[0-9]{6,20}$'),
  add column refund_holder text check (refund_holder is null or char_length(refund_holder) <= 100),
  add column refund_reference text check (refund_reference is null or char_length(refund_reference) <= 200),
  add column refunded_at timestamptz,
  add constraint bookings_refund_not_more check (refund_amount <= total_price);

alter table public.bookings drop constraint if exists bookings_fulfillment_status_check;
alter table public.bookings add constraint bookings_fulfillment_status_check
  check (fulfillment_status in ('awaiting', 'confirmed', 'rejected', 'checked_in', 'completed', 'no_show', 'guest_cancelled'));

-- Travellers cannot touch the cancellation or refund fields directly; the
-- RPCs below are the only way in.
create or replace function public.bookings_guard_client_update()
returns trigger language plpgsql as $$
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
     or new.fulfillment_updated_at is distinct from old.fulfillment_updated_at
     or new.settlement_id is distinct from old.settlement_id
     or new.refund_amount is distinct from old.refund_amount
     or new.refund_status is distinct from old.refund_status
     or new.refund_bank is distinct from old.refund_bank
     or new.refund_account is distinct from old.refund_account
     or new.refund_holder is distinct from old.refund_holder
     or new.refund_reference is distinct from old.refund_reference
     or new.refunded_at is distinct from old.refunded_at
     or new.cancelled_at is distinct from old.cancelled_at
     or new.cancel_reason is distinct from old.cancel_reason then
    raise exception 'bookings: these fields cannot be changed after booking' using errcode = '42501';
  end if;
  if new.payment_status is distinct from old.payment_status
     and not (old.payment_status = 'pending' and new.payment_status = 'cancelled') then
    raise exception 'bookings: payment status is set by the payment gateway' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A guest-cancelled stay no longer holds its room.
create or replace function public.room_reserved(p_room uuid, p_day date, p_except uuid default null) returns int
language sql volatile security definer set search_path = '' as $$
  select count(*)::int from public.bookings b join public.room_inventory r on r.id = p_room
    join public.properties p on p.id = r.property_id
  where b.hotel_place_id = p.hotel_place_id and b.room_key = r.id::text
    and b.check_in <= p_day and b.check_out > p_day
    and b.payment_status in ('pending', 'paid')
    and b.fulfillment_status not in ('rejected', 'no_show', 'guest_cancelled')
    and (p_except is null or b.id <> p_except)
$$;

-- A paid booking the hotel rejects is owed back in full.
create function public.bookings_refund_on_reject() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.fulfillment_status = 'rejected' and old.fulfillment_status <> 'rejected' and new.payment_status = 'paid'
     and coalesce(new.payment_txn_ref, '') <> 'DEMO' and new.refund_status = 'none' then
    new.refund_amount := new.total_price;
    new.refund_status := 'pending';
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;
  return new;
end $$;
revoke all on function public.bookings_refund_on_reject() from public, anon, authenticated;
create trigger bookings_refund_on_reject before update of fulfillment_status on public.bookings
  for each row execute function public.bookings_refund_on_reject();

-- ---------------------------------------------------------------- 1b. Notification triggers

create function public.bookings_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_when text := to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM');
begin
  if new.payment_status = 'paid' and old.payment_status = 'pending' then
    perform public.notify(new.user_id, 'booking.paid', 'Đã nhận thanh toán — chờ khách sạn xác nhận',
      new.hotel_name || ' · ' || new.room_name || ' · ' || v_when || ' · ' || public.vnd(new.total_price) || '. Khách sạn sẽ xác nhận còn phòng sớm.', '/bookings', new.id::text);
    perform public.notify_property(new.hotel_place_id, 'booking.new', 'Đơn mới đã thanh toán — cần xác nhận',
      new.guest_name || ' · ' || new.room_name || ' · ' || v_when || ' · ' || public.vnd(new.total_price), new.id::text);
  end if;
  if new.payment_status = 'cancelled' and old.payment_status = 'pending' and new.cancel_reason = 'expired' then
    perform public.notify(new.user_id, 'booking.expired', 'Đơn đặt phòng đã hết hạn thanh toán',
      new.hotel_name || ' · ' || v_when || '. Phòng đã được trả lại; bạn có thể đặt lại nếu vẫn còn phòng.', '/bookings', new.id::text);
  end if;
  if new.fulfillment_status is distinct from old.fulfillment_status then
    if new.fulfillment_status = 'confirmed' then
      perform public.notify(new.user_id, 'booking.confirmed', 'Khách sạn đã xác nhận đặt phòng',
        new.hotel_name || ' · ' || new.room_name || ' · ' || v_when || '. Chúc bạn có chuyến đi vui!', '/bookings', new.id::text);
    elsif new.fulfillment_status = 'rejected' then
      perform public.notify(new.user_id, 'booking.rejected', 'Khách sạn không nhận được đơn của bạn',
        new.hotel_name || ' · ' || v_when || coalesce('. Lý do: ' || new.hotel_note, '') ||
        case when new.refund_status = 'pending' then '. FoodTrip sẽ hoàn lại ' || public.vnd(new.refund_amount) || '.' else '.' end, '/bookings', new.id::text);
      if new.refund_status = 'pending' then
        perform public.notify_admins('refund.pending', 'Cần hoàn tiền — khách sạn từ chối', new.hotel_name || ' · ' || new.guest_name || ' · ' || public.vnd(new.refund_amount), '/admin?tab=settlements', new.id::text);
      end if;
    elsif new.fulfillment_status = 'guest_cancelled' then
      perform public.notify_property(new.hotel_place_id, 'booking.guest_cancelled', 'Khách đã huỷ đặt phòng',
        new.guest_name || ' · ' || new.room_name || ' · ' || v_when || '. Phòng đã được mở bán lại.', new.id::text);
      if new.refund_status = 'pending' then
        perform public.notify_admins('refund.pending', 'Cần hoàn tiền — khách huỷ', new.hotel_name || ' · ' || new.guest_name || ' · ' || public.vnd(new.refund_amount), '/admin?tab=settlements', new.id::text);
      end if;
    end if;
  end if;
  if new.refund_status = 'completed' and old.refund_status = 'pending' then
    perform public.notify(new.user_id, 'refund.completed', 'Đã hoàn tiền ' || public.vnd(new.refund_amount),
      new.hotel_name || ' · ' || v_when || '. Mã giao dịch: ' || coalesce(new.refund_reference, '—') || '.', '/bookings', new.id::text);
  end if;
  return null;
end $$;
revoke all on function public.bookings_notify() from public, anon, authenticated;
create trigger bookings_notify after update on public.bookings for each row execute function public.bookings_notify();

create function public.tour_reservations_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_start timestamptz; v_operator uuid; v_when text;
begin
  select t.title, d.starts_at, t.operator_id into v_title, v_start, v_operator
  from public.tour_departures d join public.tours t on t.id = d.tour_id where d.id = new.departure_id;
  v_when := to_char(v_start at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
  if tg_op = 'INSERT' then
    perform public.notify_operator(v_operator, 'tour.requested', 'Yêu cầu giữ chỗ mới',
      new.guest_name || ' · ' || new.seats || ' người · ' || v_title || ' · ' || v_when, '/partner/tours?tab=reservations', new.id::text);
    return null;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.user_id, 'tour.confirmed', 'Đơn vị tour đã xác nhận chỗ',
        v_title || ' · ' || v_when || ' · ' || new.seats || ' người. Đơn vị sẽ hướng dẫn thanh toán.', '/bookings#tours', new.id::text);
    elsif new.status = 'cancelled' then
      -- Tell whoever did not cancel it.
      if auth.uid() is not null and auth.uid() = new.user_id then
        perform public.notify_operator(v_operator, 'tour.cancelled_by_guest', 'Khách huỷ yêu cầu giữ chỗ',
          new.guest_name || ' · ' || v_title || ' · ' || v_when || '. Chỗ đã được trả lại.', '/partner/tours?tab=reservations', new.id::text);
      else
        perform public.notify(new.user_id, 'tour.cancelled', 'Yêu cầu giữ chỗ tour đã bị huỷ',
          v_title || ' · ' || v_when || coalesce('. ' || nullif(new.note, ''), '') || '.', '/bookings#tours', new.id::text);
      end if;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.tour_reservations_notify() from public, anon, authenticated;
create trigger tour_reservations_notify after insert or update on public.tour_reservations for each row execute function public.tour_reservations_notify();

create function public.partner_applications_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins('partner.applied', 'Đơn đăng ký đối tác lưu trú mới', new.hotel_name || ' · ' || new.address || ' · ' || new.phone, '/admin?tab=partners', new.id::text);
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.notify(new.user_id, 'partner.' || new.status,
      case when new.status = 'approved' then 'Đơn đối tác đã được duyệt' else 'Đơn đối tác chưa được duyệt' end,
      case when new.status = 'approved' then new.hotel_name || ' đã là đối tác FoodTrip. Hoàn thiện hồ sơ và mở bán trong cổng đối tác.'
        else new.hotel_name || coalesce(' · Lý do: ' || new.review_note, '') || '. Bạn có thể gửi lại.' end, '/partner', new.id::text);
  end if;
  return null;
end $$;
revoke all on function public.partner_applications_notify() from public, anon, authenticated;
create trigger partner_applications_notify after insert or update on public.partner_applications for each row execute function public.partner_applications_notify();

create function public.tour_operators_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins('operator.applied', 'Đơn đăng ký đơn vị tour mới', new.name || ' · ' || new.contact, '/admin?tab=tour-partners', new.id::text);
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.notify(new.applicant_id, 'operator.' || new.status,
      case when new.status = 'approved' then 'Đơn vị tour đã được duyệt' else 'Đơn vị tour chưa được duyệt' end,
      case when new.status = 'approved' then new.name || ' đã là đối tác tour. Tạo tour và công bố trong cổng đối tác tour.'
        else new.name || coalesce(nullif(' · Lý do: ' || new.review_note, ' · Lý do: '), '') || '. Bạn có thể gửi lại.' end, '/partner/tours', new.id::text);
  end if;
  return null;
end $$;
revoke all on function public.tour_operators_notify() from public, anon, authenticated;
create trigger tour_operators_notify after insert or update on public.tour_operators for each row execute function public.tour_operators_notify();

create function public.settlements_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_hotel text;
begin
  if new.kind = 'stay' then
    select hotel_place_id into v_hotel from public.properties where id = new.property_id;
    if tg_op = 'INSERT' then
      perform public.notify_property(v_hotel, 'settlement.created', 'Kỳ đối soát mới: ' || public.vnd(new.net),
        new.item_count || ' đơn đến ' || to_char(new.period_end, 'DD/MM/YYYY') || '. FoodTrip sẽ chuyển ' || public.vnd(new.net) || ' vào tài khoản của bạn.', new.id::text);
    elsif new.status = 'paid' and old.status = 'pending' then
      perform public.notify_property(v_hotel, 'settlement.paid', 'FoodTrip đã chuyển ' || public.vnd(new.net), 'Mã giao dịch: ' || coalesce(new.reference, '—') || '.', new.id::text);
    end if;
  else
    if tg_op = 'INSERT' then
      perform public.notify_operator(new.operator_id, 'settlement.created', 'Kỳ đối soát hoa hồng: ' || public.vnd(new.commission),
        new.item_count || ' đơn đến ' || to_char(new.period_end, 'DD/MM/YYYY') || '. Vui lòng thanh toán trong 7 ngày.', '/partner/tours?tab=money', new.id::text);
    elsif new.status = 'paid' and old.status = 'pending' then
      perform public.notify_operator(new.operator_id, 'settlement.paid', 'Đã ghi nhận thanh toán hoa hồng', 'Mã giao dịch: ' || coalesce(new.reference, '—') || '.', '/partner/tours?tab=money', new.id::text);
    end if;
  end if;
  return null;
end $$;
revoke all on function public.settlements_notify() from public, anon, authenticated;
create trigger settlements_notify after insert or update on public.settlements for each row execute function public.settlements_notify();

-- ---------------------------------------------------------------- 3b. Cancellation and refunds

-- What a guest gets back if they cancel now, by the property's policy.
--   flexible        full refund up to the day before check-in
--   moderate        full refund up to 5 days before check-in
--   strict          50% up to 7 days before check-in
--   non_refundable  nothing
create function public.booking_refund_quote(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.bookings; v_policy text; v_days int; v_pct int; v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.user_id <> auth.uid() then raise exception 'not-your-booking' using errcode = '42501'; end if;
  select coalesce(cancellation_policy, 'flexible') into v_policy from public.properties where hotel_place_id = b.hotel_place_id;
  v_policy := coalesce(v_policy, 'flexible');
  v_days := b.check_in - v_today;
  v_pct := case
    when v_policy = 'flexible' and v_days >= 1 then 100
    when v_policy = 'moderate' and v_days >= 5 then 100
    when v_policy = 'strict' and v_days >= 7 then 50
    else 0 end;
  return jsonb_build_object(
    'can_cancel', b.payment_status = 'paid' and b.fulfillment_status in ('awaiting', 'confirmed') and v_days >= 0,
    'policy', v_policy, 'days_before', v_days, 'refund_pct', v_pct,
    'demo', coalesce(b.payment_txn_ref, '') = 'DEMO',
    'refund_amount', case when coalesce(b.payment_txn_ref, '') = 'DEMO' then 0 else round(b.total_price * v_pct / 100.0) end,
    'total', b.total_price);
end $$;
revoke all on function public.booking_refund_quote(uuid) from public, anon;
grant execute on function public.booking_refund_quote(uuid) to authenticated;

create function public.guest_cancel_booking(p_booking uuid, p_reason text, p_bank text default null, p_account text default null, p_holder text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q jsonb; v_refund bigint;
begin
  perform 1 from public.bookings where id = p_booking for update;
  q := public.booking_refund_quote(p_booking);
  if not (q->>'can_cancel')::boolean then raise exception 'cannot-cancel' using errcode = '22023'; end if;
  v_refund := (q->>'refund_amount')::bigint;
  if v_refund > 0 and (char_length(btrim(coalesce(p_bank, ''))) < 2 or coalesce(p_account, '') !~ '^[0-9]{6,20}$' or char_length(btrim(coalesce(p_holder, ''))) < 2) then
    raise exception 'refund-account-required' using errcode = '22023';
  end if;
  update public.bookings set
    fulfillment_status = 'guest_cancelled', fulfillment_updated_at = now(), cancelled_at = now(),
    cancel_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 500),
    refund_amount = v_refund, refund_status = case when v_refund > 0 then 'pending' else 'none' end,
    refund_bank = case when v_refund > 0 then btrim(p_bank) end,
    refund_account = case when v_refund > 0 then p_account end,
    refund_holder = case when v_refund > 0 then upper(btrim(p_holder)) end
  where id = p_booking;
  perform public.admin_log('booking.guest_cancelled', 'bookings', p_booking::text, jsonb_build_object('refund', v_refund, 'policy', q->>'policy'));
  return q;
end $$;
revoke all on function public.guest_cancel_booking(uuid, text, text, text, text) from public, anon;
grant execute on function public.guest_cancel_booking(uuid, text, text, text, text) to authenticated;

-- Where to send a refund the guest is owed (e.g. after a hotel rejection).
create function public.guest_set_refund_account(p_booking uuid, p_bank text, p_account text, p_holder text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_bank, ''))) < 2 or coalesce(p_account, '') !~ '^[0-9]{6,20}$' or char_length(btrim(coalesce(p_holder, ''))) < 2 then
    raise exception 'refund-account-required' using errcode = '22023';
  end if;
  update public.bookings set refund_bank = btrim(p_bank), refund_account = p_account, refund_holder = upper(btrim(p_holder))
  where id = p_booking and user_id = auth.uid() and refund_status = 'pending';
  if not found then raise exception 'no-pending-refund' using errcode = '22023'; end if;
end $$;
revoke all on function public.guest_set_refund_account(uuid, text, text, text) from public, anon;
grant execute on function public.guest_set_refund_account(uuid, text, text, text) to authenticated;

create function public.admin_complete_refund(p_booking uuid, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'reference-required' using errcode = '22023'; end if;
  update public.bookings set refund_status = 'completed', refund_reference = btrim(p_reference), refunded_at = now(),
    payment_status = case when refund_amount >= total_price then 'refunded' else payment_status end
  where id = p_booking and refund_status = 'pending';
  if not found then raise exception 'no-pending-refund' using errcode = '22023'; end if;
  perform public.admin_log('booking.refunded', 'bookings', p_booking::text, jsonb_build_object('reference', btrim(p_reference)));
end $$;
revoke all on function public.admin_complete_refund(uuid, text) from public, anon;
grant execute on function public.admin_complete_refund(uuid, text) to authenticated;

-- Settlements: a stay the guest cancelled still pays out what the property
-- keeps (total less refund) once the refund is done; rows carry that amount.
create or replace function public.stay_settleable(p_property uuid, p_until date) returns setof public.bookings
language plpgsql stable security definer set search_path = '' as $$
declare r public.bookings;
begin
  for r in
    select b.* from public.bookings b join public.properties p on p.hotel_place_id = b.hotel_place_id
    where p.id = p_property and b.payment_status = 'paid' and b.settlement_id is null and b.check_out <= p_until
      and coalesce(b.payment_txn_ref, '') <> 'DEMO'
      and (b.fulfillment_status in ('completed', 'no_show')
        or (b.fulfillment_status = 'guest_cancelled' and b.refund_status <> 'pending' and b.total_price > b.refund_amount))
  loop
    r.total_price := r.total_price - r.refund_amount;
    return next r;
  end loop;
end $$;

-- ---------------------------------------------------------------- 2. Scheduled jobs

-- Unpaid bookings stop holding rooms after 30 minutes.
create function public.expire_unpaid_bookings() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.bookings set payment_status = 'cancelled', cancel_reason = 'expired', cancelled_at = now()
  where payment_status = 'pending' and created_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- Tour requests nobody confirmed within 48 hours (or by departure) are released.
create function public.expire_tour_requests() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.tour_reservations r set status = 'cancelled', note = 'Hết hạn: đơn vị tour chưa xác nhận kịp thời.'
  from public.tour_departures d
  where d.id = r.departure_id and r.status = 'requested' and (r.created_at < now() - interval '48 hours' or d.starts_at <= now());
  get diagnostics n = row_count;
  return n;
end $$;

-- Morning reminders (once each): stays and tours tomorrow, bookings a hotel
-- has left unconfirmed for over 12 hours.
create function public.send_daily_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare v_tomorrow date := (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1; b record;
begin
  for b in select * from public.bookings where check_in = v_tomorrow and payment_status = 'paid' and fulfillment_status in ('awaiting', 'confirmed')
    and not exists (select 1 from public.notifications n where n.kind = 'reminder.stay' and n.ref = bookings.id::text) loop
    perform public.notify(b.user_id, 'reminder.stay', 'Ngày mai nhận phòng: ' || b.hotel_name, b.room_name || ' · nhận phòng ' || to_char(b.check_in, 'DD/MM') || '. Mã đơn ' || b.payment_code || '.', '/bookings', b.id::text);
  end loop;
  for b in select r.*, t.title, d.starts_at, t.meeting_point from public.tour_reservations r join public.tour_departures d on d.id = r.departure_id join public.tours t on t.id = d.tour_id
    where r.status = 'confirmed' and (d.starts_at at time zone 'Asia/Ho_Chi_Minh')::date = v_tomorrow
    and not exists (select 1 from public.notifications n where n.kind = 'reminder.tour' and n.ref = r.id::text) loop
    perform public.notify(b.user_id, 'reminder.tour', 'Ngày mai đi tour: ' || b.title, to_char(b.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || ' tại ' || b.meeting_point || ' · ' || b.seats || ' người.', '/bookings#tours', b.id::text);
  end loop;
  for b in select * from public.bookings where payment_status = 'paid' and fulfillment_status = 'awaiting' and paid_at < now() - interval '12 hours'
    and not exists (select 1 from public.notifications n where n.kind = 'reminder.confirm' and n.ref = bookings.id::text) loop
    perform public.notify_property(b.hotel_place_id, 'reminder.confirm', 'Còn đơn chờ xác nhận hơn 12 giờ', b.guest_name || ' · ' || to_char(b.check_in, 'DD/MM') || '. Khách đã thanh toán — hãy xác nhận hoặc từ chối.', b.id::text);
  end loop;
end $$;
revoke all on function public.expire_unpaid_bookings() from public, anon, authenticated;
revoke all on function public.expire_tour_requests() from public, anon, authenticated;
revoke all on function public.send_daily_reminders() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
