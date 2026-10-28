-- Integration checks against the linked schema. Every fixture and notification
-- is rolled back. No emails, bank transfers, user credentials or public listings.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare
  v_owner uuid:=gen_random_uuid(); v_member uuid:=gen_random_uuid(); v_admin uuid:=gen_random_uuid();
  v_property uuid; v_room uuid; v_trip uuid; v_booking public.bookings; v_live jsonb; v_result jsonb; v_key uuid:=gen_random_uuid();
begin
  if not public.sepay_mock_enabled() then raise exception 'mock-mode-required'; end if;
  insert into auth.users(id,aud,role,email) values
    (v_owner,'authenticated','authenticated',v_owner||'@example.test'),
    (v_member,'authenticated','authenticated',v_member||'@example.test'),
    (v_admin,'authenticated','authenticated',v_admin||'@example.test');
  insert into public.admin_users(user_id) values(v_admin);
  insert into public.properties(hotel_place_id,name,inventory_enabled)
    values('qa-rollback-'||v_owner,'QA rollback only',true) returning id into v_property;
  insert into public.property_managers(property_id,user_id,role) values(v_property,v_owner,'owner');
  insert into public.room_inventory(property_id,name,capacity,quantity,nightly_price)
    values(v_property,'QA rollback room',2,1,100000) returning id into v_room;
  insert into public.itineraries(user_id,duration,budget,people,transport,days,is_public)
    values(v_owner,1,100000,1,'walk','[]',false) returning id into v_trip;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  execute 'set local role authenticated';
  v_live:=public.create_live_trip(v_trip);
  perform public.live_trip_publish((v_live->>'id')::uuid,'Owner','{"lat":10,"lng":106,"accuracy":8}');
  v_booking:=public.reserve_partner_room(v_room,current_date+31,current_date+32,1,'QA traveller','','',100000,gen_random_uuid());
  v_result:=public.mock_sepay_transfer(v_booking.id,gen_random_uuid(),'underpaid');
  if v_result->>'outcome'<>'underpaid' then raise exception 'underpayment-check-failed'; end if;
  v_result:=public.mock_sepay_transfer(v_booking.id,v_key,'remaining');
  if v_result->>'outcome'<>'paid' then raise exception 'payment-check-failed'; end if;
  v_result:=public.mock_sepay_transfer(v_booking.id,v_key,'remaining');
  if (v_result->>'duplicate')::boolean is not true then raise exception 'idempotency-check-failed'; end if;
  select * into v_booking from public.bookings where id=v_booking.id;
  if v_booking.payment_txn_ref<>'DEMO' then raise exception 'demo-label-check-failed'; end if;
  if not exists(select 1 from public.notifications where user_id=v_owner and ref=v_booking.id::text and title ilike '%mocktest%')
    then raise exception 'mock-notification-check-failed'; end if;

  perform set_config('request.jwt.claim.sub',v_member::text,true);
  begin
    perform public.live_trip_state((v_live->>'id')::uuid);
    raise exception 'expected-membership-denial';
  exception when insufficient_privilege then null; end;
  perform public.join_live_trip(v_trip,v_live->>'token','Member');
  if jsonb_array_length(public.live_trip_state((v_live->>'id')::uuid)->'members')<>2
    then raise exception 'membership-check-failed'; end if;
  begin
    perform public.mock_sepay_transfer(v_booking.id,gen_random_uuid(),'exact');
    raise exception 'expected-booking-ownership-denial';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.manage_live_trip((v_live->>'id')::uuid,'remove',v_member);
  perform set_config('request.jwt.claim.sub',v_member::text,true);
  begin
    perform public.live_trip_state((v_live->>'id')::uuid);
    raise exception 'expected-revocation-denial';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_runtime_status();
    raise exception 'expected-admin-denial';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_result:=public.admin_runtime_status();
  if (v_result->>'mock_payments')::boolean is not true or jsonb_array_length(v_result->'jobs')<>7
    then raise exception 'admin-diagnostics-check-failed'; end if;
  execute 'reset role';
end $$;
rollback;
select 'All linked-schema checks passed; fixtures rolled back' as result;
