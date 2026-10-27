-- A traveller's tour reservations carry the tour's id, so each one can link
-- to the tour's own page (/tour/:id).

begin;

create or replace function public.tour_my_reservations() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(q),'[]'::jsonb) from (
    select b.*, d.tour_id,
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
