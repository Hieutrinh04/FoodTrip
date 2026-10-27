begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Store only a member's latest fix, never a location history. All access is
-- checked on each RPC; no public Presence channel carries GPS coordinates.
create table public.live_trip_rooms (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_hash text not null unique,
  open boolean not null default true,
  expires_at timestamptz not null default now() + interval '15 days',
  created_at timestamptz not null default now()
);
create table public.live_trip_members (
  room_id uuid not null references public.live_trip_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 40),
  revoked boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key(room_id,user_id)
);
create table public.live_trip_locations (
  room_id uuid not null,
  user_id uuid not null,
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  accuracy double precision check(accuracy between 0 and 100000),
  heading double precision check(heading between 0 and 360),
  speed double precision check(speed between 0 and 500),
  updated_at timestamptz not null default now(),
  foreign key(room_id,user_id) references public.live_trip_members(room_id,user_id) on delete cascade,
  primary key(room_id,user_id)
);
create index live_trip_locations_expiry on public.live_trip_locations(updated_at);
alter table public.live_trip_rooms enable row level security;
alter table public.live_trip_members enable row level security;
alter table public.live_trip_locations enable row level security;
revoke all on public.live_trip_rooms,public.live_trip_members,public.live_trip_locations from public,anon,authenticated;

create function public.live_trip_allowed(p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.live_trip_rooms r join public.live_trip_members m on m.room_id=r.id
    where r.id=p_room and r.open and r.expires_at>now() and m.user_id=auth.uid() and not m.revoked)
$$;
revoke all on function public.live_trip_allowed(uuid) from public,anon;
grant execute on function public.live_trip_allowed(uuid) to authenticated;

create function public.create_live_trip(p_itinerary uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_token text; v_room uuid;
begin
  if auth.uid() is null then raise exception 'login-required' using errcode='42501'; end if;
  perform id from public.itineraries where id=p_itinerary and user_id=auth.uid() for update;
  if not found then raise exception 'not-your-trip' using errcode='42501'; end if;
  -- Bound abandoned rooms; creating another never invalidates an existing room.
  if (select count(*) from public.live_trip_rooms where owner_id=auth.uid() and open and expires_at>now())>=20
    then raise exception 'too-many-live-rooms'; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.live_trip_rooms(itinerary_id,owner_id,invite_hash)
    values(p_itinerary,auth.uid(),encode(sha256(convert_to(v_token,'UTF8')),'hex')) returning id into v_room;
  insert into public.live_trip_members(room_id,user_id,name) values(v_room,auth.uid(),'Chủ hành trình');
  return jsonb_build_object('id',v_room,'token',v_token);
end $$;
revoke all on function public.create_live_trip(uuid) from public,anon;
grant execute on function public.create_live_trip(uuid) to authenticated;

create function public.join_live_trip(p_itinerary uuid,p_token text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.live_trip_rooms; v_name text;
begin
  if auth.uid() is null then raise exception 'login-required' using errcode='42501'; end if;
  if p_token is null or p_token !~ '^[a-zA-Z0-9_-]{32,160}$' then raise exception 'invalid-room'; end if;
  select * into r from public.live_trip_rooms where itinerary_id=p_itinerary and
    invite_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and open and expires_at>now() for update;
  if r.id is null then raise exception 'room-unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.live_trip_members where room_id=r.id and user_id=auth.uid() and revoked)
    then raise exception 'membership-revoked' using errcode='42501'; end if;
  if not exists(select 1 from public.live_trip_members where room_id=r.id and user_id=auth.uid())
    and (select count(*) from public.live_trip_members where room_id=r.id and not revoked)>=50
    then raise exception 'room-full'; end if;
  v_name:=left(btrim(coalesce(p_name,'')),40);
  if v_name='' then v_name:='Thành viên'; end if;
  insert into public.live_trip_members(room_id,user_id,name) values(r.id,auth.uid(),v_name)
    on conflict(room_id,user_id) do update set name=excluded.name,last_seen=now();
  return jsonb_build_object('id',r.id,'owner_id',r.owner_id,'expires_at',r.expires_at);
end $$;
revoke all on function public.join_live_trip(uuid,text,text) from public,anon;
grant execute on function public.join_live_trip(uuid,text,text) to authenticated;

create function public.live_trip_state(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_itinerary uuid;
begin
  if not public.live_trip_allowed(p_room) then raise exception 'room-unavailable' using errcode='42501'; end if;
  update public.live_trip_members set last_seen=now() where room_id=p_room and user_id=auth.uid();
  select itinerary_id into v_itinerary from public.live_trip_rooms where id=p_room;
  return jsonb_build_object('trip',(select to_jsonb(t) from public.itineraries t where id=v_itinerary),
    'owner_id',(select owner_id from public.live_trip_rooms where id=p_room),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.name,
      'online',m.last_seen>now()-interval '20 seconds','sharing',l.user_id is not null,
      'location',case when l.user_id is null then null else jsonb_build_object('lat',l.lat,'lng',l.lng,
        'accuracy',l.accuracy,'heading',l.heading,'speed',l.speed) end,
      'updatedAt',extract(epoch from coalesce(l.updated_at,m.last_seen))*1000))
      from public.live_trip_members m left join public.live_trip_locations l on l.room_id=m.room_id and l.user_id=m.user_id
        and l.updated_at>now()-interval '15 seconds' and m.last_seen>now()-interval '20 seconds'
      where m.room_id=p_room and not m.revoked),'[]'::jsonb));
end $$;
revoke all on function public.live_trip_state(uuid) from public,anon;
grant execute on function public.live_trip_state(uuid) to authenticated;

create function public.live_trip_publish(p_room uuid,p_name text,p_location jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_name text; r public.live_trip_rooms;
begin
  -- Serialize room closure/removal against location writes.
  select * into r from public.live_trip_rooms where id=p_room for update;
  if not public.live_trip_allowed(p_room) then raise exception 'room-unavailable' using errcode='42501'; end if;
  v_name:=left(btrim(coalesce(p_name,'')),40);
  update public.live_trip_members set name=case when v_name='' then name else v_name end,last_seen=now()
    where room_id=p_room and user_id=auth.uid();
  if p_location is null or p_location='null'::jsonb then
    delete from public.live_trip_locations where room_id=p_room and user_id=auth.uid();
    return;
  end if;
  if jsonb_typeof(p_location)<>'object' or jsonb_typeof(p_location->'lat') is distinct from 'number'
    or jsonb_typeof(p_location->'lng') is distinct from 'number' then raise exception 'invalid-location'; end if;
  insert into public.live_trip_locations(room_id,user_id,lat,lng,accuracy,heading,speed,updated_at)
    values(p_room,auth.uid(),(p_location->>'lat')::float8,(p_location->>'lng')::float8,
      (p_location->>'accuracy')::float8,(p_location->>'heading')::float8,(p_location->>'speed')::float8,now())
    on conflict(room_id,user_id) do update set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,
      heading=excluded.heading,speed=excluded.speed,updated_at=now();
end $$;
revoke all on function public.live_trip_publish(uuid,text,jsonb) from public,anon;
grant execute on function public.live_trip_publish(uuid,text,jsonb) to authenticated;

create function public.leave_live_trip(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'login-required' using errcode='42501'; end if;
  perform id from public.live_trip_rooms where id=p_room for update;
  delete from public.live_trip_locations where room_id=p_room and user_id=auth.uid();
  update public.live_trip_members set last_seen='epoch' where room_id=p_room and user_id=auth.uid();
end $$;
revoke all on function public.leave_live_trip(uuid) from public,anon;
grant execute on function public.leave_live_trip(uuid) to authenticated;

create function public.manage_live_trip(p_room uuid,p_action text,p_member uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.live_trip_rooms; v_token text;
begin
  select * into r from public.live_trip_rooms where id=p_room for update;
  if r.owner_id is distinct from auth.uid() or not public.live_trip_allowed(p_room) then raise exception 'owners-only' using errcode='42501'; end if;
  if p_action='close' then
    update public.live_trip_rooms set open=false where id=p_room;
    delete from public.live_trip_locations where room_id=p_room;
  elsif p_action='rotate' then
    v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    update public.live_trip_rooms set invite_hash=encode(sha256(convert_to(v_token,'UTF8')),'hex') where id=p_room;
  elsif p_action='remove' and p_member is not null and p_member<>r.owner_id then
    update public.live_trip_members set revoked=true where room_id=p_room and user_id=p_member;
    if not found then raise exception 'member-not-found'; end if;
    delete from public.live_trip_locations where room_id=p_room and user_id=p_member;
  else raise exception 'invalid-room-action'; end if;
  return jsonb_build_object('token',v_token);
end $$;
revoke all on function public.manage_live_trip(uuid,text,uuid) from public,anon;
grant execute on function public.manage_live_trip(uuid,text,uuid) to authenticated;

-- Latest coordinates are hidden after 15 seconds without updates, and erased
-- after at most two minutes by a one-minute cleanup schedule.
create function public.purge_live_trip_locations() returns void
language sql security definer set search_path='' as $$
  delete from public.live_trip_locations where updated_at<now()-interval '1 minute'
    or room_id in(select id from public.live_trip_rooms where not open or expires_at<=now());
  delete from public.live_trip_rooms where expires_at<now()-interval '1 day';
$$;
revoke all on function public.purge_live_trip_locations() from public,anon,authenticated;
do $$ begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('ft-purge-live-locations','* * * * *','select public.purge_live_trip_locations()');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
