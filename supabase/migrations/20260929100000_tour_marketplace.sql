-- Tour requests are NOT hotel payments. No collection or payout is performed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create table public.tour_operators (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users(id),
  name text not null check(length(btrim(name)) between 2 and 200),
  contact text not null check(length(btrim(contact)) between 8 and 300),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  review_note text not null default '', created_at timestamptz not null default now()
);
create unique index one_open_tour_application on public.tour_operators(applicant_id) where status='pending';
create table public.tour_members (
  operator_id uuid references public.tour_operators(id), user_id uuid references auth.users(id),
  role text not null check(role in ('owner','manager','guide')), display_name text not null default '', primary key(operator_id,user_id)
);
create table public.tours (
  id uuid primary key default gen_random_uuid(), operator_id uuid not null references public.tour_operators(id),
  title text not null check(length(btrim(title)) between 3 and 200),
  destination text not null check(length(btrim(destination)) between 2 and 200),
  description text not null check(length(btrim(description)) between 20 and 10000),
  meeting_point text not null check(length(btrim(meeting_point)) between 5 and 500),
  published boolean not null default false, created_at timestamptz not null default now()
);
create table public.tour_departures (
  id uuid primary key default gen_random_uuid(), tour_id uuid not null references public.tours(id),
  starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
  capacity int not null check(capacity between 1 and 500),
  price bigint not null check(price between 1000 and 100000000),
  guide_id uuid references auth.users(id), status text not null default 'open' check(status in ('open','closed'))
);
create index tour_departures_tour_idx on public.tour_departures(tour_id,starts_at);
create table public.tour_reservations (
  id uuid primary key default gen_random_uuid(), departure_id uuid not null references public.tour_departures(id),
  user_id uuid not null references auth.users(id), request_key uuid not null,
  seats int not null check(seats between 1 and 20), guest_name text not null check(length(btrim(guest_name)) between 2 and 150),
  phone text not null check(length(btrim(phone)) between 8 and 30), total_price bigint not null,
  status text not null default 'requested' check(status in ('requested','confirmed','cancelled','completed')),
  note text not null default '', created_at timestamptz not null default now(),
  unique(user_id,request_key)
);
create unique index one_active_tour_booking on public.tour_reservations(user_id,departure_id) where status in ('requested','confirmed');
create index tour_reservations_departure_idx on public.tour_reservations(departure_id);

create function public.tour_can_manage(p_operator uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tour_members m join public.tour_operators o on o.id=m.operator_id
    where m.operator_id=p_operator and m.user_id=auth.uid() and m.role in ('owner','manager') and o.status='approved')
$$;
revoke all on function public.tour_can_manage(uuid) from public;
grant execute on function public.tour_can_manage(uuid) to authenticated;

alter table public.tour_operators enable row level security;
alter table public.tour_members enable row level security;
alter table public.tours enable row level security;
alter table public.tour_departures enable row level security;
alter table public.tour_reservations enable row level security;
revoke all on public.tour_operators,public.tour_members,public.tours,public.tour_departures,public.tour_reservations from anon,authenticated;
grant select on public.tour_operators,public.tour_members,public.tours,public.tour_departures,public.tour_reservations to authenticated;
create policy operators_read on public.tour_operators for select to authenticated using (
  applicant_id=auth.uid() or public.is_admin() or exists(select 1 from public.tour_members m where m.operator_id=id and m.user_id=auth.uid()));
create policy members_read on public.tour_members for select to authenticated using (user_id=auth.uid() or public.tour_can_manage(operator_id) or public.is_admin());
create policy tours_read on public.tours for select to authenticated using (public.tour_can_manage(operator_id) or public.is_admin());
create policy departures_read on public.tour_departures for select to authenticated using (public.is_admin() or exists(select 1 from public.tours t where t.id=tour_id and public.tour_can_manage(t.operator_id)));
create policy reservations_read on public.tour_reservations for select to authenticated using (user_id=auth.uid() or public.is_admin() or exists(
  select 1 from public.tour_departures d join public.tours t on t.id=d.tour_id where d.id=departure_id and public.tour_can_manage(t.operator_id)));

create function public.tour_apply(p_name text,p_contact text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  insert into public.tour_operators(applicant_id,name,contact) values(auth.uid(),btrim(p_name),btrim(p_contact)) returning id into v;
  insert into public.tour_members(operator_id,user_id,role,display_name) values(v,auth.uid(),'owner',btrim(p_name)); return v;
end $$;
revoke all on function public.tour_apply(text,text) from public;
grant execute on function public.tour_apply(text,text) to authenticated;

create function public.tour_review_operator(p_operator uuid,p_approve boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'admin-only'; end if;
  if p_approve is null then raise exception 'invalid-status'; end if;
  update public.tour_operators set status=case when p_approve then 'approved' else 'rejected' end,
    review_note=left(coalesce(p_note,''),2000) where id=p_operator and status='pending';
  if not found then raise exception 'application-not-pending'; end if;
  perform public.admin_log('tour.operator_reviewed','tour_operators',p_operator::text,jsonb_build_object('approved',p_approve));
end $$;
revoke all on function public.tour_review_operator(uuid,boolean,text) from public;
grant execute on function public.tour_review_operator(uuid,boolean,text) to authenticated;

create function public.tour_add_member(p_operator uuid,p_email text,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
  if not exists(select 1 from public.tour_members m join public.tour_operators o on o.id=m.operator_id
    where m.operator_id=p_operator and m.user_id=auth.uid() and m.role='owner' and o.status='approved') then raise exception 'owners-only'; end if;
  if p_role is null or p_role not in ('manager','guide') then raise exception 'invalid-role'; end if;
  select id into u from auth.users where lower(email)=lower(btrim(p_email));
  if u is null then raise exception 'account-not-found'; end if;
  -- No implicit promotion/demotion: assigned guides retain their scoped role.
  insert into public.tour_members(operator_id,user_id,role,display_name) values(p_operator,u,p_role,lower(btrim(p_email)));
  perform public.admin_log('tour.member_added','tour_operators',p_operator::text,jsonb_build_object('user',u,'role',p_role));
end $$;
revoke all on function public.tour_add_member(uuid,text,text) from public;
grant execute on function public.tour_add_member(uuid,text,text) to authenticated;

create function public.tour_remove_member(p_operator uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.tour_members m join public.tour_operators o on o.id=m.operator_id
    where m.operator_id=p_operator and m.user_id=auth.uid() and m.role='owner' and o.status='approved') then raise exception 'owners-only'; end if;
  -- Authorisation immediately ceases through the membership checks, including
  -- existing guide assignments. Owners cannot remove themselves or each other.
  delete from public.tour_members where operator_id=p_operator and user_id=p_user and role<>'owner';
  if not found then raise exception 'member-not-removable'; end if;
  perform public.admin_log('tour.member_removed','tour_operators',p_operator::text,jsonb_build_object('user',p_user));
end $$;
revoke all on function public.tour_remove_member(uuid,uuid) from public;
grant execute on function public.tour_remove_member(uuid,uuid) to authenticated;

create function public.tour_create(p_operator uuid,p_title text,p_destination text,p_description text,p_meeting text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
  if not public.tour_can_manage(p_operator) then raise exception 'not-your-operator'; end if;
  insert into public.tours(operator_id,title,destination,description,meeting_point)
    values(p_operator,btrim(p_title),btrim(p_destination),btrim(p_description),btrim(p_meeting)) returning id into v;
  perform public.admin_log('tour.created','tours',v::text); return v;
end $$;
revoke all on function public.tour_create(uuid,text,text,text,text) from public;
grant execute on function public.tour_create(uuid,text,text,text,text) to authenticated;

create function public.tour_publish(p_tour uuid,p_published boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.tours where id=p_tour and public.tour_can_manage(operator_id)) then raise exception 'not-your-operator'; end if;
  update public.tours set published=p_published where id=p_tour;
  perform public.admin_log('tour.published','tours',p_tour::text,jsonb_build_object('published',p_published));
end $$;
revoke all on function public.tour_publish(uuid,boolean) from public;
grant execute on function public.tour_publish(uuid,boolean) to authenticated;

create function public.tour_create_departure(p_tour uuid,p_start timestamptz,p_end timestamptz,p_capacity int,p_price bigint,p_guide uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.tours; v uuid;
begin
  select * into t from public.tours where id=p_tour;
  if t.id is null or not public.tour_can_manage(t.operator_id) then raise exception 'not-your-operator'; end if;
  if p_start is null or p_start<=now() then raise exception 'invalid-dates'; end if;
  if p_guide is not null and not exists(select 1 from public.tour_members where operator_id=t.operator_id and user_id=p_guide and role='guide') then raise exception 'invalid-guide'; end if;
  insert into public.tour_departures(tour_id,starts_at,ends_at,capacity,price,guide_id)
    values(p_tour,p_start,p_end,p_capacity,p_price,p_guide) returning id into v;
  perform public.admin_log('tour.departure_created','tour_departures',v::text); return v;
end $$;
revoke all on function public.tour_create_departure(uuid,timestamptz,timestamptz,int,bigint,uuid) from public;
grant execute on function public.tour_create_departure(uuid,timestamptz,timestamptz,int,bigint,uuid) to authenticated;

create function public.tour_update_departure(p_departure uuid,p_open boolean,p_guide uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare d public.tour_departures; o uuid;
begin
  select * into d from public.tour_departures where id=p_departure for update;
  select operator_id into o from public.tours where id=d.tour_id;
  if o is null or not public.tour_can_manage(o) then raise exception 'not-your-operator'; end if;
  if p_open is null or d.starts_at<=now() then raise exception 'invalid-dates'; end if;
  if p_guide is not null and not exists(select 1 from public.tour_members where operator_id=o and user_id=p_guide and role='guide') then raise exception 'invalid-guide'; end if;
  update public.tour_departures set status=case when p_open then 'open' else 'closed' end,guide_id=p_guide where id=d.id;
  perform public.admin_log('tour.departure_updated','tour_departures',d.id::text,jsonb_build_object('open',p_open,'guide',p_guide));
end $$;
revoke all on function public.tour_update_departure(uuid,boolean,uuid) from public;
grant execute on function public.tour_update_departure(uuid,boolean,uuid) to authenticated;

create function public.tour_catalog() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(q),'[]'::jsonb) from (
    select d.id,d.starts_at,d.ends_at,d.price,d.capacity,t.title,t.description,t.destination,t.meeting_point,o.name as operator_name,
      greatest(0,d.capacity-coalesce((select sum(b.seats) from public.tour_reservations b where b.departure_id=d.id and b.status in ('requested','confirmed','completed')),0)) as available
    from public.tour_departures d join public.tours t on t.id=d.tour_id join public.tour_operators o on o.id=t.operator_id
    where d.status='open' and d.starts_at>now() and t.published and o.status='approved' order by d.starts_at limit 200
  ) q
$$;
revoke all on function public.tour_catalog() from public;
grant execute on function public.tour_catalog() to anon,authenticated;

create function public.tour_reserve(p_departure uuid,p_seats int,p_name text,p_phone text,p_key uuid,p_expected_price bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.tour_departures; v uuid; used int; prior public.tour_reservations;
begin
  if auth.uid() is null then raise exception 'login-required'; end if;
  if p_key is null or p_seats is null or p_seats not between 1 and 20 then raise exception 'invalid-seats'; end if;
  select * into d from public.tour_departures where id=p_departure for update;
  select * into prior from public.tour_reservations where user_id=auth.uid() and request_key=p_key;
  if prior.id is not null then
    if (prior.departure_id,prior.seats) is distinct from (p_departure,p_seats) then raise exception 'request-key-conflict'; end if;
    return prior.id;
  end if;
  if d.id is null or d.status<>'open' or d.starts_at<=now() or not exists(select 1 from public.tours t join public.tour_operators o on o.id=t.operator_id
    where t.id=d.tour_id and t.published and o.status='approved') then raise exception 'departure-unavailable'; end if;
  select coalesce(sum(seats),0) into used from public.tour_reservations where departure_id=d.id and status in ('requested','confirmed','completed');
  if used+p_seats>d.capacity then raise exception 'tour-sold-out'; end if;
  if p_expected_price is distinct from d.price*p_seats then raise exception 'price-changed'; end if;
  insert into public.tour_reservations(departure_id,user_id,request_key,seats,guest_name,phone,total_price)
    values(d.id,auth.uid(),p_key,p_seats,btrim(p_name),btrim(p_phone),d.price*p_seats) returning id into v;
  return v;
end $$;
revoke all on function public.tour_reserve(uuid,int,text,text,uuid,bigint) from public;
grant execute on function public.tour_reserve(uuid,int,text,text,uuid,bigint) to authenticated;

create function public.tour_set_reservation(p_booking uuid,p_status text,p_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare b public.tour_reservations; d public.tour_departures; operator uuid; manager boolean;
begin
  select * into b from public.tour_reservations where id=p_booking;
  if b.id is null then raise exception 'booking-not-found'; end if;
  select * into d from public.tour_departures where id=b.departure_id for update;
  select * into b from public.tour_reservations where id=p_booking for update;
  select operator_id into operator from public.tours where id=d.tour_id;
  manager:=public.tour_can_manage(operator);
  if not manager and b.user_id is distinct from auth.uid() then raise exception 'not-your-booking'; end if;
  if not coalesce((p_status='cancelled' and b.status in ('requested','confirmed') and d.starts_at>now())
    or (manager and b.status='requested' and p_status='confirmed' and d.starts_at>now())
    or (manager and b.status='confirmed' and p_status='completed' and d.ends_at<=now()),false) then raise exception 'transition-not-allowed'; end if;
  if manager and p_status='cancelled' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'note-required'; end if;
  update public.tour_reservations set status=p_status,note=left(coalesce(p_note,''),2000) where id=b.id;
  perform public.admin_log('tour.reservation_'||p_status,'tour_reservations',b.id::text);
end $$;
revoke all on function public.tour_set_reservation(uuid,text,text) from public;
grant execute on function public.tour_set_reservation(uuid,text,text) to authenticated;

-- A guide sees only assigned departures and names/headcounts, not all orders
-- or the operator's customer phone numbers/revenue.
create function public.tour_guide_manifest() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(q),'[]'::jsonb) from (
    select d.id,d.starts_at,d.ends_at,t.title,t.meeting_point,
      coalesce((select jsonb_agg(jsonb_build_object('name',b.guest_name,'seats',b.seats)) from public.tour_reservations b
        where b.departure_id=d.id and b.status='confirmed'),'[]'::jsonb) as guests
    from public.tour_departures d join public.tours t on t.id=d.tour_id
    join public.tour_members m on m.operator_id=t.operator_id and m.user_id=d.guide_id and m.role='guide'
    join public.tour_operators o on o.id=t.operator_id
    where d.guide_id=auth.uid() and o.status='approved' and d.ends_at>=now() order by d.starts_at
  ) q
$$;
revoke all on function public.tour_guide_manifest() from public;
grant execute on function public.tour_guide_manifest() to authenticated;

create function public.tour_my_reservations() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(q),'[]'::jsonb) from (
    select b.*,t.title,t.meeting_point,d.starts_at,d.ends_at,o.name as operator_name
    from public.tour_reservations b join public.tour_departures d on d.id=b.departure_id
    join public.tours t on t.id=d.tour_id join public.tour_operators o on o.id=t.operator_id
    where b.user_id=auth.uid() order by b.created_at desc limit 200
  ) q
$$;
revoke all on function public.tour_my_reservations() from public;
grant execute on function public.tour_my_reservations() to authenticated;
commit;
