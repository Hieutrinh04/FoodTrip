begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Core itinerary identity is immutable after any reservation, including a
-- cancelled one: historical orders currently join these fields directly.
create function public.tour_update_basics(p_tour uuid,p_title text,p_destination text,p_description text,p_meeting text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tours;
begin
  select * into t from public.tours where id=p_tour for update;
  if t.id is null or not public.tour_can_manage(t.operator_id) then raise exception 'not-your-operator'; end if;
  if t.published then raise exception 'unpublish-before-edit'; end if;
  -- Serialize against reservations already in flight and departure creation.
  perform id from public.tour_departures where tour_id=t.id order by id for update;
  if exists(select 1 from public.tour_reservations b join public.tour_departures d on d.id=b.departure_id where d.tour_id=t.id)
    then raise exception 'tour-has-reservations'; end if;
  update public.tours set title=btrim(p_title),destination=btrim(p_destination),
    description=btrim(p_description),meeting_point=btrim(p_meeting) where id=t.id;
  perform public.admin_log('tour.basics_updated','tours',t.id::text);
end $$;
revoke all on function public.tour_update_basics(uuid,text,text,text,text) from public,anon;
grant execute on function public.tour_update_basics(uuid,text,text,text,text) to authenticated;

create function public.tour_edit_departure(p_departure uuid,p_start timestamptz,p_end timestamptz,p_capacity int,p_price bigint)
returns void language plpgsql security definer set search_path='' as $$
declare d public.tour_departures; o uuid; used bigint;
begin
  select * into d from public.tour_departures where id=p_departure for update;
  select operator_id into o from public.tours where id=d.tour_id;
  if o is null or not public.tour_can_manage(o) then raise exception 'not-your-operator'; end if;
  if d.starts_at<=now() or p_start is null or p_end is null or p_start<=now() or p_end<=p_start then raise exception 'invalid-dates'; end if;
  if (d.starts_at,d.ends_at) is distinct from (p_start,p_end) and exists(select 1 from public.tour_reservations where departure_id=d.id)
    then raise exception 'departure-dates-locked'; end if;
  select coalesce(sum(seats),0) into used from public.tour_reservations where departure_id=d.id and status in ('requested','confirmed','completed');
  if p_capacity<used then raise exception 'capacity-below-reserved'; end if;
  update public.tour_departures set starts_at=p_start,ends_at=p_end,capacity=p_capacity,price=p_price where id=d.id;
  -- Reservation totals are deliberately untouched. A stale new quote is
  -- rejected by tour_reserve's expected-price check under the same row lock.
  perform public.admin_log('tour.departure_terms_updated','tour_departures',d.id::text,
    jsonb_build_object('capacity',p_capacity,'price',p_price,'start',p_start,'end',p_end));
end $$;
revoke all on function public.tour_edit_departure(uuid,timestamptz,timestamptz,int,bigint) from public,anon;
grant execute on function public.tour_edit_departure(uuid,timestamptz,timestamptz,int,bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
