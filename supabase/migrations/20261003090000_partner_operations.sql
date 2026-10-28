-- Running the marketplace day to day, for each role:
--   * Settlements. FoodTrip holds a guest's room payment; once the stay is
--     over it owes the property that amount less commission. Tour operators
--     collect their own money and owe FoodTrip the commission. A settlement
--     groups the finished bookings of one partner up to a date, records what
--     changes hands and when it was paid; each booking is settled once.
--   * Hotel owners manage their own staff (no admin needed).
--   * Admins can suspend a property and hide a tour, with a logged reason.
--   * Admin and partner dashboards get their figures from the database.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('stay', 'tour')),
  property_id uuid references public.properties (id),
  operator_id uuid references public.tour_operators (id),
  period_end date not null,
  item_count int not null check (item_count > 0),
  gross bigint not null check (gross >= 0),
  commission_pct numeric(4, 2) not null,
  commission bigint not null check (commission >= 0),
  net bigint not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  reference text check (reference is null or char_length(reference) <= 200),
  paid_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check ((kind = 'stay') = (property_id is not null)),
  check ((kind = 'tour') = (operator_id is not null))
);
create index settlements_property_idx on public.settlements (property_id, created_at desc);
create index settlements_operator_idx on public.settlements (operator_id, created_at desc);
alter table public.settlements enable row level security;
revoke all on public.settlements from anon, authenticated;
grant select on public.settlements to authenticated;
create policy settlements_read on public.settlements for select to authenticated using (
  (select public.is_admin())
  or (property_id is not null and exists (select 1 from public.property_managers m where m.property_id = settlements.property_id and m.user_id = (select auth.uid()) and m.role = 'owner'))
  or (operator_id is not null and (select public.tour_can_manage(operator_id))));

alter table public.bookings add column settlement_id uuid references public.settlements (id);
alter table public.tour_reservations add column settlement_id uuid references public.settlements (id);

-- The commission a partner agreed to (10% if no terms are on record).
create function public.partner_commission_pct(p_kind text, p_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select t.commission_pct from public.partner_terms t where t.version =
    case when p_kind = 'stay' then (select terms_version from public.properties where id = p_id)
         else (select terms_version from public.tour_operators where id = p_id) end), 10)
$$;
revoke all on function public.partner_commission_pct(text, uuid) from public, anon, authenticated;

-- Stays that can be settled: paid, over (checked out or no-show), not yet settled.
create function public.stay_settleable(p_property uuid, p_until date) returns setof public.bookings
language sql stable security definer set search_path = '' as $$
  select b.* from public.bookings b join public.properties p on p.hotel_place_id = b.hotel_place_id
  where p.id = p_property and b.payment_status = 'paid' and b.fulfillment_status in ('completed', 'no_show')
    and b.settlement_id is null and b.check_out <= p_until
$$;
revoke all on function public.stay_settleable(uuid, date) from public, anon, authenticated;

create function public.tour_settleable(p_operator uuid, p_until date) returns setof public.tour_reservations
language sql stable security definer set search_path = '' as $$
  select r.* from public.tour_reservations r
    join public.tour_departures d on d.id = r.departure_id join public.tours t on t.id = d.tour_id
  where t.operator_id = p_operator and r.status = 'completed' and r.settlement_id is null
    and (d.ends_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_until
$$;
revoke all on function public.tour_settleable(uuid, date) from public, anon, authenticated;

-- A property's money, as its owner sees it: what is waiting to be settled,
-- what is still to come (paid, stay not over), and past settlements.
create function public.property_statement(p_property uuid) returns jsonb
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
      where p.id = p_property and b.payment_status = 'paid' and b.fulfillment_status in ('awaiting', 'confirmed', 'checked_in')),
    'months', coalesce((select jsonb_agg(m order by m->>'month' desc) from (
        select jsonb_build_object('month', to_char(b.check_out, 'YYYY-MM'), 'count', count(*), 'gross', sum(b.total_price),
          'commission', round(sum(b.total_price) * v_pct / 100)) as m
        from public.bookings b join public.properties p on p.hotel_place_id = b.hotel_place_id
        where p.id = p_property and b.payment_status = 'paid' and b.fulfillment_status in ('completed', 'no_show')
        group by to_char(b.check_out, 'YYYY-MM') order by 1 desc limit 12) x), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (select * from public.settlements where property_id = p_property order by created_at desc limit 24) s), '[]'::jsonb))
  into r;
  return r;
end $$;
revoke all on function public.property_statement(uuid) from public, anon;
grant execute on function public.property_statement(uuid) to authenticated;

-- An operator's commission, as its owner and managers see it.
create function public.operator_statement(p_operator uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pct numeric; v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; r jsonb;
begin
  if not (public.is_admin() or public.tour_can_manage(p_operator)) then raise exception 'not-your-operator' using errcode = '42501'; end if;
  v_pct := public.partner_commission_pct('tour', p_operator);
  select jsonb_build_object(
    'commission_pct', v_pct,
    'unsettled', (select jsonb_build_object('count', count(*), 'gross', coalesce(sum(total_price), 0), 'commission', coalesce(round(sum(total_price) * v_pct / 100), 0))
      from public.tour_settleable(p_operator, v_today)),
    'upcoming', (select jsonb_build_object('count', count(*), 'gross', coalesce(sum(r.total_price), 0))
      from public.tour_reservations r join public.tour_departures d on d.id = r.departure_id join public.tours t on t.id = d.tour_id
      where t.operator_id = p_operator and r.status in ('requested', 'confirmed')),
    'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (select * from public.settlements where operator_id = p_operator order by created_at desc limit 24) s), '[]'::jsonb))
  into r;
  return r;
end $$;
revoke all on function public.operator_statement(uuid) from public, anon;
grant execute on function public.operator_statement(uuid) to authenticated;

-- Admin: every partner with something to settle, with where to pay.
create function public.admin_settlement_candidates() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'stays', coalesce((select jsonb_agg(x order by (x->>'gross')::bigint desc) from (
      select jsonb_build_object('property_id', p.id, 'name', p.name, 'pct', pct, 'count', count(b.id), 'gross', sum(b.total_price),
        'commission', round(sum(b.total_price) * pct / 100), 'net', sum(b.total_price) - round(sum(b.total_price) * pct / 100),
        'bank', (select jsonb_build_object('bank_name', x.bank_name, 'account_number', x.account_number, 'account_holder', x.account_holder)
                 from public.property_payouts x where x.property_id = p.id)) as x
      from public.properties p cross join lateral (select public.partner_commission_pct('stay', p.id) as pct) c
      join lateral public.stay_settleable(p.id, v_today) b on true
      group by p.id, p.name, pct) s), '[]'::jsonb),
    'tours', coalesce((select jsonb_agg(x order by (x->>'gross')::bigint desc) from (
      select jsonb_build_object('operator_id', o.id, 'name', o.name, 'pct', pct, 'count', count(r.id), 'gross', sum(r.total_price),
        'commission', round(sum(r.total_price) * pct / 100)) as x
      from public.tour_operators o cross join lateral (select public.partner_commission_pct('tour', o.id) as pct) c
      join lateral public.tour_settleable(o.id, v_today) r on true
      group by o.id, o.name, pct) s), '[]'::jsonb));
end $$;
revoke all on function public.admin_settlement_candidates() from public, anon;
grant execute on function public.admin_settlement_candidates() to authenticated;

-- Admin: settle one partner's finished bookings up to a date.
create function public.admin_create_settlement(p_kind text, p_target uuid, p_until date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pct numeric; v_count int; v_gross bigint; v_commission bigint;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  if p_kind not in ('stay', 'tour') then raise exception 'invalid-kind' using errcode = '22023'; end if;
  if p_until is null or p_until > (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'invalid-dates' using errcode = '22023'; end if;
  v_pct := public.partner_commission_pct(p_kind, p_target);
  if p_kind = 'stay' then
    select count(*), coalesce(sum(total_price), 0) into v_count, v_gross from public.stay_settleable(p_target, p_until);
  else
    select count(*), coalesce(sum(total_price), 0) into v_count, v_gross from public.tour_settleable(p_target, p_until);
  end if;
  if v_count = 0 then raise exception 'nothing-to-settle' using errcode = '22023'; end if;
  v_commission := round(v_gross * v_pct / 100);
  insert into public.settlements (kind, property_id, operator_id, period_end, item_count, gross, commission_pct, commission, net, created_by)
    values (p_kind, case when p_kind = 'stay' then p_target end, case when p_kind = 'tour' then p_target end, p_until,
      v_count, v_gross, v_pct, v_commission, case when p_kind = 'stay' then v_gross - v_commission else v_commission end, auth.uid())
    returning id into v_id;
  if p_kind = 'stay' then
    update public.bookings set settlement_id = v_id where id in (select id from public.stay_settleable(p_target, p_until));
  else
    update public.tour_reservations set settlement_id = v_id where id in (select id from public.tour_settleable(p_target, p_until));
  end if;
  perform public.admin_log('settlement.created', 'settlements', v_id::text, jsonb_build_object('kind', p_kind, 'items', v_count, 'gross', v_gross));
  return v_id;
end $$;
revoke all on function public.admin_create_settlement(text, uuid, date) from public, anon;
grant execute on function public.admin_create_settlement(text, uuid, date) to authenticated;

create function public.admin_mark_settlement_paid(p_settlement uuid, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'reference-required' using errcode = '22023'; end if;
  update public.settlements set status = 'paid', reference = btrim(p_reference), paid_at = now() where id = p_settlement and status = 'pending';
  if not found then raise exception 'settlement-not-pending' using errcode = '22023'; end if;
  perform public.admin_log('settlement.paid', 'settlements', p_settlement::text, jsonb_build_object('reference', btrim(p_reference)));
end $$;
revoke all on function public.admin_mark_settlement_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_settlement_paid(uuid, text) to authenticated;

-- Hotel owners run their own team: the people who see bookings and check guests in.
create function public.property_team(p_property uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role) order by m.role desc, u.email), '[]'::jsonb)
  from public.property_managers m join auth.users u on u.id = m.user_id
  where m.property_id = p_property and (public.manages_property(p_property) or public.is_admin())
$$;
revoke all on function public.property_team(uuid) from public, anon;
grant execute on function public.property_team(uuid) to authenticated;

create function public.owner_set_property_staff(p_property uuid, p_email text, p_add boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not exists (select 1 from public.property_managers where property_id = p_property and user_id = auth.uid() and role = 'owner') then
    raise exception 'owners-only' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then raise exception 'account-not-found' using errcode = 'P0002'; end if;
  if p_add then
    insert into public.property_managers (property_id, user_id, role) values (p_property, v_user, 'staff') on conflict (property_id, user_id) do nothing;
  else
    -- Owners are never removed this way; only staff.
    delete from public.property_managers where property_id = p_property and user_id = v_user and role = 'staff';
    if not found then raise exception 'member-not-removable' using errcode = '22023'; end if;
  end if;
  perform public.admin_log(case when p_add then 'property.staff_added' else 'property.staff_removed' end, 'properties', p_property::text, jsonb_build_object('user', v_user));
end $$;
revoke all on function public.owner_set_property_staff(uuid, text, boolean) from public, anon;
grant execute on function public.owner_set_property_staff(uuid, text, boolean) to authenticated;

-- Admin moderation: suspend or restore a property (a suspended one takes no
-- new bookings: hotel_takes_bookings and the catalogues check `active`), and
-- hide a published tour.
create function public.admin_set_property_active(p_property uuid, p_active boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  if not p_active and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note-required' using errcode = '22023'; end if;
  update public.properties set active = p_active where id = p_property;
  if not found then raise exception 'property-not-found' using errcode = 'P0002'; end if;
  perform public.admin_log(case when p_active then 'property.restored' else 'property.suspended' end, 'properties', p_property::text, jsonb_build_object('note', btrim(coalesce(p_note, ''))));
end $$;
revoke all on function public.admin_set_property_active(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_property_active(uuid, boolean, text) to authenticated;

create function public.admin_hide_tour(p_tour uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note-required' using errcode = '22023'; end if;
  update public.tours set published = false where id = p_tour;
  if not found then raise exception 'tour-not-found' using errcode = 'P0002'; end if;
  perform public.admin_log('tour.hidden_by_admin', 'tours', p_tour::text, jsonb_build_object('note', btrim(p_note)));
end $$;
revoke all on function public.admin_hide_tour(uuid, text) from public, anon;
grant execute on function public.admin_hide_tour(uuid, text) to authenticated;

-- Admin: all tours, with operator and how they are doing.
create function public.admin_list_tours() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select jsonb_build_object('id', t.id, 'title', t.title, 'destination', t.destination, 'published', t.published, 'created_at', t.created_at,
      'operator', o.name, 'operator_status', o.status, 'cover_url', t.cover_url,
      'departures', (select count(*) from public.tour_departures d where d.tour_id = t.id and d.starts_at > now()),
      'requests', (select count(*) from public.tour_reservations r join public.tour_departures d on d.id = r.departure_id where d.tour_id = t.id and r.status = 'requested'),
      'seats', (select coalesce(sum(r.seats), 0) from public.tour_reservations r join public.tour_departures d on d.id = r.departure_id where d.tour_id = t.id and r.status in ('confirmed', 'completed'))) as x
    from public.tours t join public.tour_operators o on o.id = t.operator_id limit 500) s), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_tours() from public, anon;
grant execute on function public.admin_list_tours() to authenticated;

-- Admin overview: the partner side of the business.
create function public.admin_partner_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not public.is_admin() then raise exception 'not-admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'properties_live', (select count(*) from public.properties where active and inventory_enabled),
    'properties_setup', (select count(*) from public.properties where active and not inventory_enabled),
    'properties_suspended', (select count(*) from public.properties where not active),
    'operators', (select count(*) from public.tour_operators where status = 'approved'),
    'operators_pending', (select count(*) from public.tour_operators where status = 'pending'),
    'tours_published', (select count(*) from public.tours where published),
    'tour_requests', (select count(*) from public.tour_reservations where status = 'requested'),
    'stays_to_confirm', (select count(*) from public.bookings where payment_status = 'paid' and fulfillment_status = 'awaiting'),
    'payout_due', (select coalesce(sum(x.total_price - round(x.total_price * public.partner_commission_pct('stay', p.id) / 100)), 0)
      from public.properties p cross join lateral public.stay_settleable(p.id, v_today) x),
    'commission_due', (select coalesce(sum(round(x.total_price * public.partner_commission_pct('tour', o.id) / 100)), 0)
      from public.tour_operators o cross join lateral public.tour_settleable(o.id, v_today) x),
    'settlements_pending', (select count(*) from public.settlements where status = 'pending'));
end $$;
revoke all on function public.admin_partner_overview() from public, anon;
grant execute on function public.admin_partner_overview() to authenticated;

notify pgrst, 'reload schema';
commit;
