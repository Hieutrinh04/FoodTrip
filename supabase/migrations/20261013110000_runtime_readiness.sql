begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

-- Read-only admin diagnostics, never configuration values or guest records.
create function public.admin_runtime_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_jobs jsonb:='[]'; v_name text; v_active boolean; v_failures bigint;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode='42501'; end if;
  foreach v_name in array array['ft-expire-unpaid-bookings','ft-expire-tour-requests','ft-daily-reminders',
    'ft-send-emails','ft-review-invites','ft-purge-search-cache','ft-purge-live-locations'] loop
    v_active:=false; v_failures:=0;
    if to_regclass('cron.job') is not null then
      execute 'select coalesce(bool_or(active),false) from cron.job where jobname=$1' into v_active using v_name;
      if to_regclass('cron.job_run_details') is not null then
        execute 'select count(*) from cron.job_run_details r join cron.job j on j.jobid=r.jobid
          where j.jobname=$1 and r.status=$2 and r.start_time>now()-interval ''24 hours'''
          into v_failures using v_name,'failed';
      end if;
    end if;
    v_jobs:=v_jobs||jsonb_build_array(jsonb_build_object('name',v_name,'active',v_active,'failures',v_failures));
  end loop;
  return jsonb_build_object('mock_payments',public.sepay_mock_enabled(),
    'live_rooms',to_regprocedure('public.live_trip_state(uuid)') is not null,
    'bookable_properties',(select count(*) from public.properties where active and inventory_enabled),
    'published_tours',(select count(*) from public.tours t join public.tour_operators o on o.id=t.operator_id where t.published and o.status='approved'),
    'jobs',v_jobs);
end $$;
revoke all on function public.admin_runtime_status() from public,anon;
grant execute on function public.admin_runtime_status() to authenticated;

-- Simulated stays must not become verified public reviews.
create function public.reviews_guard_mock_stay() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='stay' and exists(select 1 from public.bookings where id=new.booking_id and payment_txn_ref='DEMO')
    then raise exception 'mock-booking-not-reviewable' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.reviews_guard_mock_stay() from public,anon,authenticated;
create trigger reviews_guard_mock_stay before insert or update of rating,comment,booking_id on public.reviews
  for each row execute function public.reviews_guard_mock_stay();

-- Preserve the notification lifecycle but distinguish simulated money.
create or replace function public.bookings_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_when text := to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM');
begin
  if new.payment_status = 'paid' and old.payment_status = 'pending' then
    perform public.notify(new.user_id, 'booking.paid', case when new.payment_txn_ref='DEMO' then 'SePay mocktest — thanh toán thử, không có tiền thật' else 'Đã nhận thanh toán — chờ khách sạn xác nhận' end,
      new.hotel_name || ' · ' || new.room_name || ' · ' || v_when || ' · ' || public.vnd(new.total_price) || '. Khách sạn sẽ xác nhận còn phòng sớm.', '/bookings', new.id::text);
    perform public.notify_property(new.hotel_place_id, 'booking.new', case when new.payment_txn_ref='DEMO' then 'Đơn thử SePay mocktest — không có tiền thật' else 'Đơn mới đã thanh toán — cần xác nhận' end,
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
revoke all on function public.bookings_notify() from public,anon,authenticated;

create or replace function public.invite_reviews() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_count integer := 0; v_n integer;
begin
  insert into public.notifications (user_id, kind, title, body, link, ref)
  select b.user_id, 'review.invite', 'Kỳ nghỉ ở ' || b.hotel_name || ' thế nào?',
    'Chấm điểm và kể vài dòng để giúp những du khách sau chọn chỗ ở — chỉ mất một phút.', '/bookings', b.id::text
  from public.bookings b
  where b.payment_status = 'paid' and coalesce(b.payment_txn_ref,'')<>'DEMO' and b.fulfillment_status in ('confirmed', 'checked_in', 'completed')
    and b.check_out between v_today - 3 and v_today
    and not exists (select 1 from public.reviews r where r.booking_id = b.id)
    and not exists (select 1 from public.notifications n where n.kind = 'review.invite' and n.ref = b.id::text);
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into public.notifications (user_id, kind, title, body, link, ref)
  select r.user_id, 'review.invite', 'Tour ' || t.title || ' thế nào?',
    'Chấm điểm và kể vài dòng để giúp những du khách sau chọn tour — chỉ mất một phút.', '/bookings#tours', r.id::text
  from public.tour_reservations r join public.tour_departures d on d.id = r.departure_id join public.tours t on t.id = d.tour_id
  where r.status in ('confirmed', 'completed') and r.user_id is not null
    and d.ends_at between now() - interval '3 days' and now()
    and not exists (select 1 from public.reviews x where x.reservation_id = r.id)
    and not exists (select 1 from public.notifications n where n.kind = 'review.invite' and n.ref = r.id::text);
  get diagnostics v_n = row_count;
  return v_count + v_n;
end $$;
revoke all on function public.invite_reviews() from public,anon,authenticated;
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
    'revenue_paid', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'paid' and coalesce(payment_txn_ref,'')<>'DEMO'),
    'revenue_30d', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'paid' and coalesce(payment_txn_ref,'')<>'DEMO' and paid_at > now() - interval '30 days'),
    'pending_amount', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'pending'),
    'refunded_amount', (select coalesce(sum(total_price), 0) from public.bookings where payment_status = 'refunded' and coalesce(payment_txn_ref,'')<>'DEMO'),
    'payments_attention', (select count(*) from public.payment_transactions where provider='sepay' and outcome in ('underpaid', 'no-booking', 'not-pending', 'wrong-account')),
    'partner_applications', (select count(*) from public.partner_applications where status = 'pending'),
    'hotel_rejected_paid', (select count(*) from public.bookings where payment_status = 'paid' and coalesce(payment_txn_ref,'')<>'DEMO' and fulfillment_status = 'rejected'),
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
        'revenue', (select coalesce(sum(b.total_price), 0) from public.bookings b where b.payment_status = 'paid' and coalesce(b.payment_txn_ref,'')<>'DEMO' and b.paid_at >= d and b.paid_at < d + interval '1 day')
      ) order by d)
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as d)
  );
end;
$$;
revoke all on function public.admin_overview() from public,anon;
grant execute on function public.admin_overview() to authenticated;
notify pgrst,'reload schema';
commit;

