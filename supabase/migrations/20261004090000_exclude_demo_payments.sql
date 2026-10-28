-- A booking "paid" in demo mode (no payment gateway configured yet) carries
-- payment_txn_ref = 'DEMO' and no money was received. It must never be paid
-- out to a property, nor counted as revenue owed to one.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.stay_settleable(p_property uuid, p_until date) returns setof public.bookings
language sql stable security definer set search_path = '' as $$
  select b.* from public.bookings b join public.properties p on p.hotel_place_id = b.hotel_place_id
  where p.id = p_property and b.payment_status = 'paid' and b.fulfillment_status in ('completed', 'no_show')
    and b.settlement_id is null and b.check_out <= p_until
    and coalesce(b.payment_txn_ref, '') <> 'DEMO'
$$;

create or replace function public.property_statement(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pct numeric; v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; r jsonb;
begin
  if not (public.is_admin() or exists (select 1 from public.property_managers where property_id = p_property and user_id = auth.uid() and role = 'owner')) then
    raise exception 'owners-only' using errcode = '42501';
  end if;
  v_pct := public.partner_commission_pct('stay', p_property);
  select jsonb_build_object(
    'commission_pct', v_pct,
    'unsettled', (select jsonb_build_object('count', count(*), 'gross', coalesce(sum(total_price), 0),
        'commission', coalesce(round(sum(total_price) * v_pct / 100), 0), 'net', coalesce(sum(total_price) - round(sum(total_price) * v_pct / 100), 0))
      from public.stay_settleable(p_property, v_today)),
    'upcoming', (select jsonb_build_object('count', count(*), 'gross', coalesce(sum(b.total_price), 0))
      from public.bookings b join public.properties p on p.hotel_place_id = b.hotel_place_id
      where p.id = p_property and b.payment_status = 'paid' and b.fulfillment_status in ('awaiting', 'confirmed', 'checked_in')
        and coalesce(b.payment_txn_ref, '') <> 'DEMO'),
    'demo', (select count(*) from public.bookings b join public.properties p on p.hotel_place_id = b.hotel_place_id
      where p.id = p_property and b.payment_txn_ref = 'DEMO'),
    'months', coalesce((select jsonb_agg(m order by m->>'month' desc) from (
        select jsonb_build_object('month', to_char(b.check_out, 'YYYY-MM'), 'count', count(*), 'gross', sum(b.total_price),
          'commission', round(sum(b.total_price) * v_pct / 100)) as m
        from public.bookings b join public.properties p on p.hotel_place_id = b.hotel_place_id
        where p.id = p_property and b.payment_status = 'paid' and b.fulfillment_status in ('completed', 'no_show')
          and coalesce(b.payment_txn_ref, '') <> 'DEMO'
        group by to_char(b.check_out, 'YYYY-MM') order by 1 desc limit 12) x), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (select * from public.settlements where property_id = p_property order by created_at desc limit 24) s), '[]'::jsonb))
  into r;
  return r;
end $$;

notify pgrst, 'reload schema';
commit;
