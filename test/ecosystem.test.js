import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Real PostgreSQL/WASM engine, isolated in memory: no remote data or auth users.
// Minimal fixtures provide existing Supabase schemas; new migrations run verbatim.
test('partner ecosystem SQL: inventory, reservations and tenant permissions', async (t) => {
  const db = new PGlite()
  const users = { admin: '00000000-0000-4000-8000-000000000001', owner: '00000000-0000-4000-8000-000000000002', staff: '00000000-0000-4000-8000-000000000003', guest: '00000000-0000-4000-8000-000000000004', other: '00000000-0000-4000-8000-000000000005', guide: '00000000-0000-4000-8000-000000000006' }
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const rpc = (name, args = []) => scalar(`select public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')})`, args)
  async function as(name) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[name] ?? ''])
    await db.exec(name ? 'set role authenticated' : 'set role anon')
  }
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_user::text $$;
      grant usage on schema auth, public to anon,authenticated;
      grant execute on all functions in schema auth to anon,authenticated;
      create function public.is_admin() returns boolean language sql stable as $$ select coalesce(auth.uid()='${users.admin}'::uuid,false) $$;
      create table public.properties(id uuid primary key default gen_random_uuid(),hotel_place_id text unique not null,name text not null,address text,active boolean default true);
      create table public.property_managers(property_id uuid references public.properties(id),user_id uuid references auth.users(id),role text,primary key(property_id,user_id));
      create function public.manages_property(p uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.property_managers where property_id=p and user_id=auth.uid()) $$;
      create table public.admin_audit(action text,target_id text);
      create function public.admin_log(a text,b text,c text,d jsonb default '{}'::jsonb) returns void language sql security definer as $$ insert into public.admin_audit values(a,c) $$;
      revoke all on function public.admin_log(text,text,text,jsonb) from public;
    `)
    for (const [name,id] of Object.entries(users)) await db.query('insert into auth.users values($1,$2)',[id,`${name}@example.test`])
    await db.exec(await readFile(new URL('../supabase/migrations/20260804090000_bookings.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260923090000_bookings_payment_guard.sql', import.meta.url), 'utf8'))
    await db.exec("alter table public.bookings add column fulfillment_status text not null default 'awaiting'; grant select,insert,update on public.bookings to authenticated")
    // Hosted Supabase grants directly to API roles, not only to PUBLIC.
    await db.exec('alter default privileges in schema public grant execute on functions to anon,authenticated')
    await db.exec(await readFile(new URL('../supabase/migrations/20260929090000_room_inventory.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260929100000_tour_marketplace.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260929110000_ecosystem_function_permissions.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260930100000_tour_details.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261001090000_partner_only_bookings.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260930120000_room_inventory_management.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260930130000_tour_management_edits.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260930140000_tour_reservation_snapshot.sql', import.meta.url), 'utf8'))
    const property = await scalar("insert into public.properties(hotel_place_id,name,address) values('hotel-test','Test Hotel','Da Nang') returning id")
    await db.query("insert into public.property_managers values($1,$2,'owner'),($1,$3,'staff')",[property,users.owner,users.staff])
    const roomIn = '2099-01-01', roomOut = '2099-01-03'
    let room, booking, operator, tour, departure, reservation
    const insertBooking = (who, total=250000, checkIn=roomIn, checkOut=roomOut) => scalar(`insert into public.bookings
      (user_id,hotel_place_id,hotel_name,room_key,room_name,price_per_night,check_in,check_out,nights,guests,total_price,guest_name)
      values($1,'hotel-test','Untrusted name',$2,'Untrusted room',1,$3,$4,2,2,$5,'Test guest') returning id`,[users[who],room,checkIn,checkOut,total])

    await t.test('Supabase default grants cannot expose private RPCs or internal helpers',async () => {
      const anonFunctions=(await db.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and (proname like 'tour_%' or proname in
        ('hotel_booking_status','hotel_takes_bookings','guard_partner_only_booking','inventory_owner','manager_save_room','manager_set_room_dates','manager_enable_inventory',
         'reserve_partner_room','room_reserved','guard_inventory_booking','hotel_room_quote'))
        and has_function_privilege('anon',p.oid,'EXECUTE') order by proname`)).rows.map((r) => r.proname)
      assert.deepEqual(anonFunctions,['hotel_booking_status','hotel_room_quote','tour_catalog','tour_detail'])
      await as('guest')
      await assert.rejects(rpc('room_reserved',[crypto.randomUUID(),roomIn,null]),/permission denied/)
      await as()
      await assert.rejects(rpc('tour_my_reservations'),/permission denied/)
    })
    await t.test('only property owners can create and activate inventory',async () => {
      await as('staff'); await assert.rejects(rpc('manager_save_room',[property,'Double',2,1,100000]),/owners-only/)
      await as('owner'); room=await rpc('manager_save_room',[property,'Double',2,1,100000])
      await rpc('manager_enable_inventory',[property])
      await rpc('manager_set_room_dates',[room,'2099-01-02','2099-01-02',1,150000])
    })
    await t.test('public quote uses daily prices and does not expose guest data', async () => {
      await as(); const q=await rpc('hotel_room_quote',['hotel-test',roomIn,roomOut,2])
      assert.equal(q.managed,true); assert.equal(q.rooms[0].total_price,250000); assert.equal(q.rooms[0].rooms_left,1)
      assert.equal(JSON.stringify(q).includes('guest'),false)
      await assert.rejects(db.query('select * from public.room_inventory'),/permission denied/)
    })
    await t.test('server rejects forged prices and rewrites room names',async () => {
      await as('guest'); await assert.rejects(insertBooking('guest',1000),/price-changed/)
      booking=await insertBooking('guest')
      const b=(await db.query('select * from public.bookings where id=$1',[booking])).rows[0]
      assert.equal(b.hotel_name,'Test Hotel'); assert.equal(b.room_name,'Double'); assert.equal(Number(b.total_price),250000)
    })
    await t.test('second customer cannot overbook; owner cannot reduce sold inventory',async () => {
      await as('other'); await assert.rejects(insertBooking('other'),/room-sold-out/)
      assert.equal((await db.query('select * from public.bookings')).rows.length,0)
      assert.equal((await db.query('select * from public.room_inventory')).rows.length,0)
      await as('owner'); await assert.rejects(rpc('manager_set_room_dates',[room,roomIn,roomIn,0,100000]),/below-reserved-quantity/)
    })
    await t.test('checkout date is exclusive; cancellation releases stock',async () => {
      await as('other'); await insertBooking('other',100000,roomOut,'2099-01-04')
      await as('guest'); await db.query("update public.bookings set payment_status='cancelled' where id=$1",[booking])
      assert.equal((await rpc('hotel_room_quote',['hotel-test',roomIn,roomOut,2])).rooms[0].rooms_left,1)
    })
    await t.test('only partner hotels with their own inventory take bookings',async () => {
      await as(); const status=await rpc('hotel_booking_status',[['hotel-test','hb-999']])
      assert.deepEqual(status.map((h) => h.hotel_place_id),['hotel-test'])
      assert.equal(status[0].name,'Test Hotel')
      await as('guest')
      await assert.rejects(db.query(`insert into public.bookings(user_id,hotel_place_id,hotel_name,room_key,room_name,price_per_night,check_in,check_out,nights,guests,total_price,guest_name)
        values($1,'hb-999','Search result hotel','std','Standard',500000,'2099-03-01','2099-03-02',1,2,500000,'Test guest')`,[users.guest]),/hotel-not-bookable/)
    })
    await t.test('partner reservation RPC safely retries without creating two orders',async () => {
      await as('guest'); const key=crypto.randomUUID()
      const args=[room,roomIn,roomOut,2,'Test guest','0900000000','guest@example.test',250000,key]
      // Raw PostgreSQL composite values are strings in this driver. Serialize
      // the row explicitly, matching PostgREST's JSON response to the browser.
      const reserve = () => scalar('select to_jsonb(public.reserve_partner_room($1,$2,$3,$4,$5,$6,$7,$8,$9))',args)
      const first=await reserve()
      assert.match(first.id,/^[0-9a-f-]{36}$/)
      assert.equal((await reserve()).id,first.id)
      await assert.rejects(rpc('reserve_partner_room',[room,roomIn,roomOut,1,'Test guest','','',250000,key]),/request-key-conflict/)
      const cancelled=await db.query("update public.bookings set payment_status='cancelled' where id=$1 returning id",[first.id])
      assert.equal(cancelled.rows.length,1)
    })
    await t.test('a bulk insert cannot reserve the last room twice in one statement',async () => {
      await as('guest')
      assert.equal((await rpc('hotel_room_quote',['hotel-test',roomIn,roomOut,2])).rooms[0].rooms_left,1)
      await assert.rejects(db.query(`insert into public.bookings
        (user_id,hotel_place_id,hotel_name,room_key,room_name,price_per_night,check_in,check_out,nights,guests,total_price,guest_name)
        select $1,'hotel-test','Untrusted',$2,'Untrusted',1,'2099-01-01'::date,'2099-01-03'::date,2,2,250000,'Test guest'
        from generate_series(1,2)`,[users.guest,room]),/room-sold-out/)
      assert.equal((await rpc('hotel_room_quote',['hotel-test',roomIn,roomOut,2])).rooms[0].rooms_left,1)
    })
    await t.test('pending tour operators cannot publish; only admin approves',async () => {
      await as('owner'); operator=await rpc('tour_apply',['Test Tours','owner@example.test'])
      await assert.rejects(rpc('tour_create',[operator,'Food tour','Da Nang','A real itinerary with meals and a guide included.','123 Test Street']),/not-your-operator/)
      await assert.rejects(rpc('tour_review_operator',[operator,true,'Verified']),/admin-only/)
      await as('admin'); await rpc('tour_review_operator',[operator,true,'Verified'])
      await as('owner'); await rpc('tour_add_member',[operator,'guide@example.test','guide'])
      tour=await rpc('tour_create',[operator,'Food tour','Da Nang','A real itinerary with meals and a guide included.','123 Test Street'])
      departure=await rpc('tour_create_departure',[tour,'2099-02-01T09:00:00+07:00','2099-02-01T12:00:00+07:00',2,300000,users.guide])
      await rpc('tour_publish',[tour,true])
    })
    await t.test('public tour catalogue excludes operator private contacts',async () => {
      await as(); const rows=await rpc('tour_catalog'); assert.equal(rows.length,1); assert.equal(rows[0].available,2)
      assert.equal(JSON.stringify(rows).includes('owner@example.test'),false)
      await assert.rejects(rpc('tour_reserve',[departure,1,'Test Guest','0900000000',crypto.randomUUID(),300000]),/permission denied/)
    })
    await t.test('tour page content: only managers edit it, the public reads it once published',async () => {
      const details={ summary:'Ăn sáng phố cổ', gallery:['https://img.example/1.jpg','  ','https://img.example/2.jpg'],
        highlights:['Cao lầu','','Bánh mì'], schedule:[{ title:'Buổi sáng', meals:'Ăn sáng', body:'Chợ Hội An' },{ title:' ' },'junk'],
        includes:['Hướng dẫn viên'], excludes:['VAT'], transport:'Đi bộ' }
      await as('guide'); await assert.rejects(rpc('tour_update_details',[tour,details]),/not-your-operator/)
      await as('other'); await assert.rejects(rpc('tour_update_details',[tour,details]),/not-your-operator/)
      await as('owner'); await assert.rejects(rpc('tour_update_details',[tour,{ gallery:['http://img.example/x.jpg'] }]),/invalid-photo-url/)
      await rpc('tour_update_details',[tour,details])
      await as(); const page=await rpc('tour_detail',[tour])
      assert.deepEqual(page.gallery,['https://img.example/1.jpg','https://img.example/2.jpg'])
      assert.equal(page.cover_url,'https://img.example/1.jpg', 'the first photo becomes the cover')
      assert.deepEqual(page.highlights,['Cao lầu','Bánh mì'])
      assert.deepEqual(page.schedule,[{ title:'Buổi sáng', meals:'Ăn sáng', body:'Chợ Hội An' }])
      assert.equal(page.departures.length,1); assert.equal(page.departures[0].available,2)
      assert.equal(JSON.stringify(page).includes('owner@example.test'),false)
      const card=(await rpc('tour_catalog'))[0]; assert.equal(card.tour_id,tour); assert.equal(card.cover_url,'https://img.example/1.jpg')
      await as('guest'); await assert.rejects(rpc('tour_seats_left',[departure]),/permission denied/)
      await as('owner'); await rpc('tour_publish',[tour,false])
      await as(); assert.equal(await rpc('tour_detail',[tour]),null)
      await as('owner'); await rpc('tour_publish',[tour,true])
    })
    await t.test('tour reservation checks price and capacity, retries are idempotent',async () => {
      await as('guest'); const key=crypto.randomUUID()
      await assert.rejects(rpc('tour_reserve',[departure,2,'Test Guest','0900000000',key,1]),/price-changed/)
      reservation=await rpc('tour_reserve',[departure,2,'Test Guest','0900000000',key,600000])
      assert.equal(await rpc('tour_reserve',[departure,2,'Test Guest','0900000000',key,600000]),reservation)
      await as('other'); await assert.rejects(rpc('tour_reserve',[departure,1,'Other Guest','0911111111',crypto.randomUUID(),300000]),/tour-sold-out/)
    })
    await t.test('traveller cannot confirm own order; guide sees only assigned manifest',async () => {
      await as('guest'); await assert.rejects(rpc('tour_set_reservation',[reservation,'confirmed','']),/transition-not-allowed/)
      const my=await rpc('tour_my_reservations'); assert.equal(my.length,1); assert.equal(my[0].title,'Food tour')
      await as('owner'); await rpc('tour_set_reservation',[reservation,'confirmed','Welcome'])
      await as('guide'); assert.equal((await db.query('select * from public.tour_reservations')).rows.length,0)
      const manifest=await rpc('tour_guide_manifest'); assert.equal(manifest.length,1); assert.equal(manifest[0].guests[0].seats,2)
      assert.equal(JSON.stringify(manifest).includes('0900000000'),false)
      await assert.rejects(rpc('tour_publish',[tour,false]),/not-your-operator/)
      await as('other'); assert.deepEqual(await rpc('tour_guide_manifest'),[])
      assert.equal((await db.query('select * from public.tour_operators')).rows.length,0)
    })
    await t.test('cancellation returns tour seats; completed status cannot be set early',async () => {
      await as('owner'); await assert.rejects(rpc('tour_set_reservation',[reservation,'completed','']),/transition-not-allowed/)
      await as('guest'); await rpc('tour_set_reservation',[reservation,'cancelled','Plans changed'])
      await as('other'); await rpc('tour_reserve',[departure,2,'Other Guest','0911111111',crypto.randomUUID(),600000])
      await assert.rejects(db.query("update public.tour_departures set capacity=500 where id=$1",[departure]),/permission denied/)
    })
    await t.test('room edits preserve existing orders and enforce owner permissions',async () => {
      await as('owner')
      const editable=await rpc('manager_save_room',[property,'Editable',4,2,100000])
      await rpc('manager_set_room_dates',[editable,'2099-04-01','2099-04-01',2,150000])
      await as('guest')
      const args=[editable,'2099-04-01','2099-04-03',3,'Test guest','','',250000,crypto.randomUUID()]
      const reserved=await scalar('select to_jsonb(public.reserve_partner_room($1,$2,$3,$4,$5,$6,$7,$8,$9))',args)
      await as('staff'); await assert.rejects(rpc('manager_update_room',[editable,'Edited',4,2,200000,false]),/owners-only/)
      await as('owner')
      await assert.rejects(rpc('manager_update_room',[editable,'Edited',2,2,200000,true]),/capacity-below-booked-guests/)
      await assert.rejects(rpc('manager_update_room',[editable,'Edited',4,1,200000,true]),/calendar-exceeds-quantity/)
      await rpc('manager_update_room',[editable,'Edited',4,2,200000,false])
      await as('guest')
      const q=await rpc('hotel_room_quote',['hotel-test','2099-04-01','2099-04-03',3])
      assert.equal(q.rooms.some((r) => r.id===editable),false)
      const order=(await db.query('select * from public.bookings where id=$1',[reserved.id])).rows[0]
      assert.equal(Number(order.total_price),250000); assert.equal(order.room_name,'Editable'); assert.equal(order.payment_status,'pending')
      await as('owner'); await rpc('manager_reset_room_dates',[editable,'2099-04-01','2099-04-02'])
      await rpc('manager_update_room',[editable,'Edited',4,1,200000,true])
      await as('guest')
      const revised=await rpc('hotel_room_quote',['hotel-test','2099-04-01','2099-04-03',3])
      assert.equal(revised.rooms.find((r) => r.id===editable).total_price,400000)
      assert.equal(revised.rooms.find((r) => r.id===editable).rooms_left,0)
      await as('staff'); await assert.rejects(rpc('manager_reset_room_dates',[editable,'2099-04-01','2099-04-02']),/owners-only/)
      await as(); await assert.rejects(rpc('manager_update_room',[editable,'Edited',4,1,200000,true]),/permission denied/)
    })
    await t.test('physical room quantity cannot drop below reservations on default-price nights',async () => {
      await as('owner'); const r=await rpc('manager_save_room',[property,'Two rooms',2,2,100000])
      await as('guest')
      for (let i=0;i<2;i++) await rpc('reserve_partner_room',[r,'2099-05-01','2099-05-02',1,'Guest Test','','',100000,crypto.randomUUID()])
      await as('owner')
      await assert.rejects(rpc('manager_update_room',[r,'Two rooms',2,1,100000,true]),/below-reserved-quantity/)
      await as(); assert.equal((await rpc('hotel_room_quote',['hotel-test','2099-05-01','2099-05-02',1])).rooms.find((x) => x.id===r).rooms_left,0)
    })
    await t.test('closing departures and revoking guides take effect immediately',async () => {
      await as('owner'); await rpc('tour_update_departure',[departure,false,users.guide])
      await as(); assert.deepEqual(await rpc('tour_catalog'),[])
      await as('owner'); await rpc('tour_remove_member',[operator,users.guide])
      await as('guide'); assert.deepEqual(await rpc('tour_guide_manifest'),[])
      await as('owner'); await assert.rejects(rpc('tour_update_departure',[departure,true,users.guide]),/invalid-guide/)
      await assert.rejects(rpc('tour_remove_member',[operator,users.owner]),/member-not-removable/)
    })
    await t.test('tour and departure edits preserve booked prices, dates and history',async () => {
      await as('owner')
      const editable=await rpc('tour_create',[operator,'Draft tour','Da Nang','Description long enough for a real tour.','123 Test Street'])
      const basics=[editable,'Updated tour','Hoi An','Updated description for this itinerary.','456 Other Street']
      await rpc('tour_update_basics',basics)
      const dep=await rpc('tour_create_departure',[editable,'2099-06-01T02:00:00Z','2099-06-01T05:00:00Z',4,100000,null])
      await as('other'); await assert.rejects(rpc('tour_update_basics',basics),/not-your-operator/)
      await assert.rejects(rpc('tour_edit_departure',[dep,'2099-06-02T02:00:00Z','2099-06-02T05:00:00Z',3,200000]),/not-your-operator/)
      await as('owner')
      await rpc('tour_edit_departure',[dep,'2099-06-02T02:00:00Z','2099-06-02T05:00:00Z',3,200000])
      await rpc('tour_update_details',[editable,{ summary:'Nội dung đã chốt', highlights:['Có ăn sáng'], cancel_policy:'Hoàn theo chính sách lúc đặt' }])
      await rpc('tour_publish',[editable,true])
      await assert.rejects(rpc('tour_update_basics',basics),/unpublish-before-edit/)
      await as('guest')
      const bookingId=await rpc('tour_reserve',[dep,2,'Guest Test','0900000000',crypto.randomUUID(),400000])
      await as('owner')
      await rpc('tour_update_details',[editable,{ summary:'Nội dung mới sau khi khách đã đặt', highlights:['Đã đổi'], cancel_policy:'Chính sách mới' }])
      await assert.rejects(rpc('tour_edit_departure',[dep,'2099-06-03T02:00:00Z','2099-06-03T05:00:00Z',3,250000]),/departure-dates-locked/)
      await assert.rejects(rpc('tour_edit_departure',[dep,'2099-06-02T02:00:00Z','2099-06-02T05:00:00Z',1,250000]),/capacity-below-reserved/)
      await rpc('tour_edit_departure',[dep,'2099-06-02T02:00:00Z','2099-06-02T05:00:00Z',3,250000])
      await as('guest')
      const old=(await rpc('tour_my_reservations')).find((b) => b.id===bookingId)
      assert.equal(Number(old.total_price),400000)
      assert.equal(new Date(old.starts_at).toISOString(),'2099-06-02T02:00:00.000Z')
      assert.equal(old.tour_snapshot.summary,'Nội dung đã chốt')
      assert.deepEqual(old.tour_snapshot.highlights,['Có ăn sáng'])
      assert.equal(old.tour_snapshot.cancel_policy,'Hoàn theo chính sách lúc đặt')
      await as('other'); await assert.rejects(rpc('tour_reserve',[dep,1,'Other Test','0911111111',crypto.randomUUID(),200000]),/price-changed/)
      await as('guest'); await rpc('tour_set_reservation',[bookingId,'cancelled','Change plans'])
      await as('owner'); await rpc('tour_publish',[editable,false])
      await assert.rejects(rpc('tour_update_basics',basics),/tour-has-reservations/)
      await as(); await assert.rejects(rpc('tour_update_basics',basics),/permission denied/)
    })
  } finally { await db.close() }
})
