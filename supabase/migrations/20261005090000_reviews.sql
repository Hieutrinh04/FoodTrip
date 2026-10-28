-- Reviews after a stay or a tour.
--
-- Only someone who actually stayed or went can review: the review hangs off
-- their own paid booking (after check-out) or their own tour reservation
-- (after the tour ended), one review per booking or reservation, editable by
-- its author. Partners answer publicly; admins can hide a review (with a
-- reason, logged). Hotel cards, the booking page, tour cards and tour pages
-- show the average and the count.
--
-- The table is reached only through the functions below; the API roles have
-- no direct access to it.

begin;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('stay', 'tour')),
  booking_id uuid unique references public.bookings(id) on delete cascade,
  reservation_id uuid unique references public.tour_reservations(id) on delete cascade,
  hotel_place_id text,
  tour_id uuid references public.tours(id) on delete cascade,
  operator_id uuid references public.tour_operators(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  -- Shown instead of the guest's full name: "Mai T." for "Trần Thị Mai".
  author_name text not null default '' check (char_length(author_name) <= 60),
  -- What was reviewed, shown beside it: the room and month, or the tour date.
  context text check (context is null or char_length(context) <= 200),
  reply text check (reply is null or char_length(reply) <= 1000),
  replied_at timestamptz,
  hidden boolean not null default false,
  hidden_note text check (hidden_note is null or char_length(hidden_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_target check (
    (kind = 'stay' and booking_id is not null and hotel_place_id is not null and reservation_id is null and tour_id is null and operator_id is null)
    or (kind = 'tour' and reservation_id is not null and tour_id is not null and operator_id is not null and booking_id is null and hotel_place_id is null))
);
create index reviews_hotel_idx on public.reviews (hotel_place_id, created_at desc) where kind = 'stay';
create index reviews_tour_idx on public.reviews (tour_id, created_at desc) where kind = 'tour';
create index reviews_operator_idx on public.reviews (operator_id) where kind = 'tour';
create index reviews_user_idx on public.reviews (user_id);
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;

-- "Mai T." from "Trần Thị Mai": the given name (last word) and the family
-- name's initial. A single word is shown as it is.
create function private.review_author(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(array_length(w, 1), 0) = 0 or w[1] = '' then ''
    when array_length(w, 1) = 1 then left(w[1], 40)
    else left(w[array_length(w, 1)], 40) || ' ' || left(w[1], 1) || '.'
  end
  from (select regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+') as w) x
$$;

-- Average and count of the visible reviews of one hotel or one tour.
create function private.review_summary(p_kind text, p_target text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('rating', round(avg(r.rating)::numeric, 1), 'review_count', count(*))
  from public.reviews r
  where not r.hidden and r.kind = p_kind
    and ((p_kind = 'stay' and r.hotel_place_id = p_target) or (p_kind = 'tour' and r.tour_id::text = p_target))
$$;
revoke all on function private.review_summary(text, text) from public, anon, authenticated;

-- Writes (or rewrites) the caller's review of one of their own stays or tours.
create function public.submit_review(p_kind text, p_ref uuid, p_rating integer, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_id uuid;
  b public.bookings;
  r public.tour_reservations;
  d public.tour_departures;
  t public.tours;
begin
  if v_user is null then raise exception 'login-required' using errcode = '42501'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid-rating' using errcode = '22023'; end if;
  if char_length(coalesce(v_comment, '')) > 2000 then raise exception 'comment-too-long' using errcode = '22023'; end if;

  if p_kind = 'stay' then
    select * into b from public.bookings where id = p_ref and user_id = v_user;
    if not found then raise exception 'not-your-booking' using errcode = '42501'; end if;
    if not (b.payment_status = 'paid'
      and (b.fulfillment_status = 'completed' or (b.fulfillment_status in ('confirmed', 'checked_in') and b.check_out <= v_today))) then
      raise exception 'not-reviewable-yet' using errcode = '22023';
    end if;
    if b.check_out < v_today - 180 then raise exception 'review-window-closed' using errcode = '22023'; end if;
    insert into public.reviews (user_id, kind, booking_id, hotel_place_id, rating, comment, author_name, context)
    values (v_user, 'stay', b.id, b.hotel_place_id, p_rating, v_comment, private.review_author(b.guest_name),
      left(b.room_name || ' · ' || to_char(b.check_in, 'MM/YYYY'), 200))
    on conflict (booking_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
    returning id into v_id;

  elsif p_kind = 'tour' then
    select * into r from public.tour_reservations where id = p_ref and user_id = v_user;
    if not found then raise exception 'not-your-reservation' using errcode = '42501'; end if;
    select * into d from public.tour_departures where id = r.departure_id;
    select * into t from public.tours where id = d.tour_id;
    if not (r.status = 'completed' or (r.status = 'confirmed' and d.ends_at <= now())) then
      raise exception 'not-reviewable-yet' using errcode = '22023';
    end if;
    if d.ends_at < now() - interval '180 days' then raise exception 'review-window-closed' using errcode = '22023'; end if;
    insert into public.reviews (user_id, kind, reservation_id, tour_id, operator_id, rating, comment, author_name, context)
    values (v_user, 'tour', r.id, t.id, t.operator_id, p_rating, v_comment, private.review_author(r.guest_name),
      left(to_char(d.starts_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || ' · ' || r.seats || ' khách', 200))
    on conflict (reservation_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
    returning id into v_id;

  else
    raise exception 'invalid-kind' using errcode = '22023';
  end if;
  return v_id;
end $$;
revoke all on function public.submit_review(text, uuid, integer, text) from public, anon;
grant execute on function public.submit_review(text, uuid, integer, text) to authenticated;

-- The visible reviews of a hotel ('stay', hotel id) or a tour ('tour', tour id), newest first.
create function public.reviews_for(p_kind text, p_target text, p_limit integer default 10, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.review_summary(p_kind, p_target) || jsonb_build_object(
    'breakdown', coalesce((select jsonb_object_agg(s.rating, s.n) from (
      select r.rating, count(*) as n from public.reviews r
      where not r.hidden and r.kind = p_kind and ((p_kind = 'stay' and r.hotel_place_id = p_target) or (p_kind = 'tour' and r.tour_id::text = p_target))
      group by r.rating) s), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
      select r.id, r.rating, r.comment, r.author_name as author, r.context, r.reply, r.replied_at, r.created_at, r.updated_at
      from public.reviews r
      where not r.hidden and r.kind = p_kind and ((p_kind = 'stay' and r.hotel_place_id = p_target) or (p_kind = 'tour' and r.tour_id::text = p_target))
      order by r.created_at desc
      limit least(greatest(coalesce(p_limit, 10), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) q), '[]'::jsonb))
$$;
revoke all on function public.reviews_for(text, text, integer, integer) from public;
grant execute on function public.reviews_for(text, text, integer, integer) to anon, authenticated;

-- The caller's own reviews, keyed to the booking or reservation they belong to.
create function public.my_reviews() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'booking_id', r.booking_id, 'reservation_id', r.reservation_id,
    'rating', r.rating, 'comment', r.comment, 'reply', r.reply, 'replied_at', r.replied_at, 'hidden', r.hidden,
    'created_at', r.created_at, 'updated_at', r.updated_at) order by r.created_at desc), '[]'::jsonb)
  from public.reviews r where r.user_id = auth.uid()
$$;
revoke all on function public.my_reviews() from public, anon;
grant execute on function public.my_reviews() to authenticated;

-- A partner's reviews: a property's (its managers) or an operator's (owners and managers), hidden ones included.
create function public.partner_reviews(p_kind text, p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hotel text;
begin
  if p_kind = 'stay' then
    if not public.manages_property(p_owner) then raise exception 'not-your-property' using errcode = '42501'; end if;
    select hotel_place_id into v_hotel from public.properties where id = p_owner;
    return private.review_summary('stay', v_hotel) || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
      select r.id, r.rating, r.comment, r.author_name as author, r.context, r.reply, r.replied_at, r.hidden, r.hidden_note, r.created_at, r.updated_at
      from public.reviews r where r.kind = 'stay' and r.hotel_place_id = v_hotel order by r.created_at desc limit 300) q), '[]'::jsonb));
  elsif p_kind = 'tour' then
    if not public.tour_can_manage(p_owner) then raise exception 'not-your-operator' using errcode = '42501'; end if;
    return jsonb_build_object(
      'rating', (select round(avg(rating)::numeric, 1) from public.reviews where kind = 'tour' and operator_id = p_owner and not hidden),
      'review_count', (select count(*) from public.reviews where kind = 'tour' and operator_id = p_owner and not hidden),
      'items', coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
        select r.id, r.rating, r.comment, r.author_name as author, r.context, r.reply, r.replied_at, r.hidden, r.hidden_note, r.created_at, r.updated_at,
          t.title as tour_title
        from public.reviews r join public.tours t on t.id = r.tour_id
        where r.kind = 'tour' and r.operator_id = p_owner order by r.created_at desc limit 300) q), '[]'::jsonb));
  end if;
  raise exception 'invalid-kind' using errcode = '22023';
end $$;
revoke all on function public.partner_reviews(text, uuid) from public, anon;
grant execute on function public.partner_reviews(text, uuid) to authenticated;

-- A partner's public answer to a review; an empty answer removes it.
create function public.review_reply(p_review uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews; v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select * into r from public.reviews where id = p_review;
  if not found then raise exception 'review-not-found' using errcode = 'P0002'; end if;
  if r.kind = 'stay' and not exists (select 1 from public.properties p where p.hotel_place_id = r.hotel_place_id and public.manages_property(p.id)) then
    raise exception 'not-your-property' using errcode = '42501';
  end if;
  if r.kind = 'tour' and not public.tour_can_manage(r.operator_id) then raise exception 'not-your-operator' using errcode = '42501'; end if;
  if char_length(coalesce(v_reply, '')) > 1000 then raise exception 'reply-too-long' using errcode = '22023'; end if;
  update public.reviews set reply = v_reply, replied_at = case when v_reply is null then null else now() end where id = p_review;
end $$;
revoke all on function public.review_reply(uuid, text) from public, anon;
grant execute on function public.review_reply(uuid, text) to authenticated;

-- Admin moderation.
create function public.admin_list_reviews() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select r.id, r.kind, r.rating, r.comment, r.author_name as author, r.context, r.reply, r.hidden, r.hidden_note, r.created_at,
      coalesce(p.name, b.hotel_name, t.title) as subject
    from public.reviews r
    left join public.bookings b on b.id = r.booking_id
    left join public.properties p on p.hotel_place_id = r.hotel_place_id
    left join public.tours t on t.id = r.tour_id
    order by r.created_at desc limit 500) q), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_reviews() from public, anon;
grant execute on function public.admin_list_reviews() to authenticated;

create function public.admin_set_review_hidden(p_review uuid, p_hidden boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  if p_hidden and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note-required' using errcode = '22023'; end if;
  update public.reviews set hidden = p_hidden, hidden_note = case when p_hidden then btrim(p_note) else null end where id = p_review;
  if not found then raise exception 'review-not-found' using errcode = 'P0002'; end if;
  perform public.admin_log(case when p_hidden then 'review.hidden' else 'review.restored' end, 'reviews', p_review::text, jsonb_build_object('note', btrim(coalesce(p_note, ''))));
end $$;
revoke all on function public.admin_set_review_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_review_hidden(uuid, boolean, text) to authenticated;

-- Notifications: the partner hears of a new review, the author of an answer.
create function public.reviews_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_stars text;
begin
  v_stars := repeat('★', new.rating) || repeat('☆', 5 - new.rating);
  if tg_op = 'INSERT' then
    if new.kind = 'stay' then
      insert into public.notifications (user_id, kind, title, body, link, ref)
      select m.user_id, 'review.new', 'Đánh giá mới ' || v_stars, left(new.author_name || ': ' || coalesce(new.comment, '(không có nhận xét)'), 1000), '/partner?tab=reviews', new.id::text
      from public.property_managers m join public.properties p on p.id = m.property_id where p.hotel_place_id = new.hotel_place_id;
    else
      perform public.notify_operator(new.operator_id, 'review.new', 'Đánh giá tour mới ' || v_stars,
        new.author_name || ': ' || coalesce(new.comment, '(không có nhận xét)'), '/partner/tours?tab=reviews', new.id::text);
    end if;
  elsif new.reply is not null and new.reply is distinct from old.reply then
    perform public.notify(new.user_id, 'review.reply',
      case when new.kind = 'stay' then 'Khách sạn đã trả lời đánh giá của bạn' else 'Đơn vị tour đã trả lời đánh giá của bạn' end,
      new.reply, case when new.kind = 'stay' then '/bookings' else '/bookings#tours' end, new.id::text);
  end if;
  return new;
end $$;
revoke all on function public.reviews_notify() from public, anon, authenticated;
create trigger reviews_notify after insert or update of reply on public.reviews for each row execute function public.reviews_notify();

-- The day after a stay or a tour, ask for a review (once).
create function public.invite_reviews() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_count integer := 0; v_n integer;
begin
  insert into public.notifications (user_id, kind, title, body, link, ref)
  select b.user_id, 'review.invite', 'Kỳ nghỉ ở ' || b.hotel_name || ' thế nào?',
    'Chấm điểm và kể vài dòng để giúp những du khách sau chọn chỗ ở — chỉ mất một phút.', '/bookings', b.id::text
  from public.bookings b
  where b.payment_status = 'paid' and b.fulfillment_status in ('confirmed', 'checked_in', 'completed')
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
revoke all on function public.invite_reviews() from public, anon, authenticated;
select cron.schedule('ft-review-invites', '0 2 * * *', 'select public.invite_reviews()');  -- 09:00 in Vietnam

-- Ratings on the cards and pages that list partner hotels and tours.
create or replace function public.hotel_booking_status(p_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('hotel_place_id', p.hotel_place_id, 'name', p.name, 'address', p.address,
    'photo_url', p.photo_url, 'gallery', to_jsonb(p.gallery), 'lat', p.lat, 'lng', p.lng, 'description', p.description,
    'property_type', p.property_type, 'star_rating', p.star_rating, 'amenities', to_jsonb(p.amenities),
    'check_in_time', to_char(p.check_in_time, 'HH24:MI'), 'check_out_time', to_char(p.check_out_time, 'HH24:MI'),
    'cancellation_policy', p.cancellation_policy, 'house_rules', p.house_rules) || private.review_summary('stay', p.hotel_place_id)), '[]'::jsonb)
  from public.properties p
  where p.hotel_place_id = any(coalesce(p_ids[1:300], '{}')) and p.active and p.inventory_enabled
$$;

create or replace function public.partner_hotels_near(p_lat double precision, p_lng double precision, p_radius_km double precision default 15)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(q) || private.review_summary('stay', q.id) order by q.distance_km), '[]'::jsonb) from (
    select p.hotel_place_id as id, p.name, p.address, p.city, p.lat, p.lng, p.photo_url, to_jsonb(p.gallery) as gallery, p.description,
      p.property_type, p.star_rating, to_jsonb(p.amenities) as amenities, p.cancellation_policy,
      (select min(r.nightly_price) from public.room_inventory r where r.property_id = p.id and r.active) as price_from,
      round((6371 * 2 * asin(sqrt(power(sin(radians(p.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - p_lng) / 2), 2))))::numeric, 2) as distance_km
    from public.properties p
    where p.active and p.inventory_enabled and p.lat is not null
  ) q
  where p_lat is not null and p_lng is not null and q.distance_km <= least(greatest(coalesce(p_radius_km, 15), 1), 50)
  limit 50
$$;

create or replace function public.tour_catalog() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(q) || private.review_summary('tour', q.tour_id::text)), '[]'::jsonb) from (
    select d.id, t.id as tour_id, d.starts_at, d.ends_at, d.price, d.capacity, t.title, t.description, t.destination, t.meeting_point,
      o.name as operator_name, t.summary, t.cover_url, t.highlights[1:3] as highlights, t.transport,
      public.tour_seats_left(d.id) as available
    from public.tour_departures d join public.tours t on t.id = d.tour_id join public.tour_operators o on o.id = t.operator_id
    where d.status = 'open' and d.starts_at > now() and t.published and o.status = 'approved' order by d.starts_at limit 200
  ) q
$$;

create or replace function public.tour_detail(p_tour uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id', t.id, 'title', t.title, 'destination', t.destination, 'description', t.description,
    'meeting_point', t.meeting_point, 'operator_name', o.name, 'summary', t.summary,
    'cover_url', t.cover_url, 'gallery', to_jsonb(t.gallery), 'highlights', to_jsonb(t.highlights),
    'schedule', t.schedule, 'includes', to_jsonb(t.includes), 'excludes', to_jsonb(t.excludes),
    'transport', t.transport, 'start_point', t.start_point, 'child_policy', t.child_policy,
    'cancel_policy', t.cancel_policy, 'notes', t.notes,
    'departures', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'price', d.price,
          'capacity', d.capacity, 'available', public.tour_seats_left(d.id)) order by d.starts_at)
      from public.tour_departures d where d.tour_id = t.id and d.status = 'open' and d.starts_at > now()), '[]'::jsonb))
    || private.review_summary('tour', t.id::text)
  from public.tours t join public.tour_operators o on o.id = t.operator_id
  where t.id = p_tour and t.published and o.status = 'approved'
$$;

notify pgrst, 'reload schema';
commit;
