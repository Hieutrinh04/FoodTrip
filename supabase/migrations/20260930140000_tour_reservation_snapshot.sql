-- A reservation is a record of the terms the traveller accepted, not a live
-- view of the operator's editable tour page. Keep those customer-visible terms
-- on the order while retaining the normalized tables for operations.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.tour_reservations
  add column tour_snapshot jsonb not null default '{}'::jsonb
  check (jsonb_typeof(tour_snapshot) = 'object');

create or replace function public.tour_reserve(p_departure uuid,p_seats int,p_name text,p_phone text,p_key uuid,p_expected_price bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  d public.tour_departures;
  t public.tours;
  v uuid;
  used int;
  prior public.tour_reservations;
  v_operator_name text;
  v_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if p_key is null or p_seats is null or p_seats not between 1 and 20 then raise exception 'invalid-seats'; end if;

  -- The departure lock serializes availability, the quoted price and the
  -- snapshot so they all describe exactly the same accepted departure.
  select * into d from public.tour_departures where id=p_departure for update;
  select * into prior from public.tour_reservations where user_id=auth.uid() and request_key=p_key;
  if prior.id is not null then
    if (prior.departure_id,prior.seats) is distinct from (p_departure,p_seats) then raise exception 'request-key-conflict'; end if;
    return prior.id;
  end if;

  select tr.* into t from public.tours tr join public.tour_operators o on o.id=tr.operator_id
    where tr.id=d.tour_id and tr.published and o.status='approved';
  if d.id is null or d.status<>'open' or d.starts_at<=now() or t.id is null then raise exception 'departure-unavailable'; end if;
  select name into v_operator_name from public.tour_operators where id=t.operator_id;

  select coalesce(sum(seats),0) into used from public.tour_reservations
    where departure_id=d.id and status in ('requested','confirmed','completed');
  if used+p_seats>d.capacity then raise exception 'tour-sold-out'; end if;
  if p_expected_price is distinct from d.price*p_seats then raise exception 'price-changed'; end if;

  v_snapshot := jsonb_build_object(
    'tour_id', t.id, 'title', t.title, 'destination', t.destination,
    'description', t.description, 'meeting_point', t.meeting_point,
    'operator_name', v_operator_name, 'summary', t.summary,
    'cover_url', t.cover_url, 'gallery', to_jsonb(t.gallery),
    'highlights', to_jsonb(t.highlights), 'schedule', t.schedule,
    'includes', to_jsonb(t.includes), 'excludes', to_jsonb(t.excludes),
    'transport', t.transport, 'start_point', t.start_point,
    'child_policy', t.child_policy, 'cancel_policy', t.cancel_policy,
    'notes', t.notes,
    'departure', jsonb_build_object('id', d.id, 'starts_at', d.starts_at,
      'ends_at', d.ends_at, 'price', d.price, 'capacity', d.capacity)
  );
  insert into public.tour_reservations(departure_id,user_id,request_key,seats,guest_name,phone,total_price,tour_snapshot)
    values(d.id,auth.uid(),p_key,p_seats,btrim(p_name),btrim(p_phone),d.price*p_seats,v_snapshot) returning id into v;
  return v;
end $$;
revoke all on function public.tour_reserve(uuid,int,text,text,uuid,bigint) from public, anon;
grant execute on function public.tour_reserve(uuid,int,text,text,uuid,bigint) to authenticated;

-- The UI uses the snapshot first. The fallback supports orders created before
-- this migration, for which no historic page content exists to reconstruct.
create or replace function public.tour_my_reservations() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(q),'[]'::jsonb) from (
    select b.*,
      coalesce(nullif(b.tour_snapshot->>'title',''),t.title) as title,
      coalesce(nullif(b.tour_snapshot->>'meeting_point',''),t.meeting_point) as meeting_point,
      coalesce(nullif(b.tour_snapshot->>'operator_name',''),o.name) as operator_name,
      coalesce(nullif(b.tour_snapshot->'departure'->>'starts_at','')::timestamptz,d.starts_at) as starts_at,
      coalesce(nullif(b.tour_snapshot->'departure'->>'ends_at','')::timestamptz,d.ends_at) as ends_at
    from public.tour_reservations b join public.tour_departures d on d.id=b.departure_id
    join public.tours t on t.id=d.tour_id join public.tour_operators o on o.id=t.operator_id
    where b.user_id=auth.uid() order by b.created_at desc limit 200
  ) q
$$;
revoke all on function public.tour_my_reservations() from public, anon;
grant execute on function public.tour_my_reservations() to authenticated;

notify pgrst, 'reload schema';
commit;
