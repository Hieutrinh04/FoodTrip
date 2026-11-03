-- LOCAL ONLY. Invoked through docker exec supabase_db_Tripfood by the guarded runner.
-- All accounts use this public test password, never a production password.
begin;
do $$
declare n int; v_id uuid; names text[] := array['customer','admin','owner','staff','tour-owner','tour-manager','guide','customer-two'];
begin
  for n in 1..array_length(names,1) loop
    v_id := ('e2e00000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
      values('00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',names[n] || '@e2e.example.test',extensions.crypt('Local-E2E-only-2026!',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')
      on conflict(id) do nothing;
    insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values(v_id,v_id,v_id::text,jsonb_build_object('sub',v_id,'email',names[n] || '@e2e.example.test'),'email',now(),now(),now()) on conflict do nothing;
  end loop;
end $$;
insert into public.admin_users(user_id) values('e2e00000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.properties(id,hotel_place_id,name,active,inventory_enabled)
  values('e2e00000-0000-4000-8000-000000000101','e2e-local-hotel','E2E Local Hotel',true,true) on conflict do nothing;
insert into public.property_managers(property_id,user_id,role) values
  ('e2e00000-0000-4000-8000-000000000101','e2e00000-0000-4000-8000-000000000003','owner'),
  ('e2e00000-0000-4000-8000-000000000101','e2e00000-0000-4000-8000-000000000004','staff') on conflict do nothing;
insert into public.room_inventory(id,property_id,name,capacity,quantity,nightly_price)
  values(:'e2e_room_id','e2e00000-0000-4000-8000-000000000101','E2E Last Room',2,1,100000) on conflict do nothing;
insert into public.tour_operators(id,applicant_id,name,contact,status)
  values('e2e00000-0000-4000-8000-000000000201','e2e00000-0000-4000-8000-000000000005','E2E Local Tours','local@example.test','approved') on conflict do nothing;
insert into public.tour_members(operator_id,user_id,role) values
  ('e2e00000-0000-4000-8000-000000000201','e2e00000-0000-4000-8000-000000000005','owner'),
  ('e2e00000-0000-4000-8000-000000000201','e2e00000-0000-4000-8000-000000000006','manager'),
  ('e2e00000-0000-4000-8000-000000000201','e2e00000-0000-4000-8000-000000000007','guide') on conflict do nothing;
insert into public.tours(id,operator_id,title,destination,description,meeting_point,published)
  values('e2e00000-0000-4000-8000-000000000202','e2e00000-0000-4000-8000-000000000201','E2E Local Tour','Hà Nội','Tour fixture for local testing only.','Local test meeting point',true) on conflict do nothing;
insert into public.tour_departures(id,tour_id,starts_at,ends_at,capacity,price,guide_id)
  values(:'e2e_departure_id','e2e00000-0000-4000-8000-000000000202',now()+interval '20 days',now()+interval '21 days',20,200000,'e2e00000-0000-4000-8000-000000000007') on conflict do nothing;
insert into private.settings(key,value) values('payment_mode','sepay-mock') on conflict(key) do update set value=excluded.value;
commit;
