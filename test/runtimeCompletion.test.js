import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('secure live rooms and SePay mock/atomic settlement', async (t) => {
  const db = new PGlite()
  const ids = { owner:crypto.randomUUID(), member:crypto.randomUUID(), other:crypto.randomUUID(), admin:crypto.randomUUID() }
  const tripId = crypto.randomUUID()
  const rpc = async (name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result
  const as = async (name) => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]??''])
    await db.exec(name==='service'?'set role service_role':name?'set role authenticated':'set role anon')
  }
  const booking = async (user,code) => {
    await db.exec('reset role')
    return (await db.query("insert into public.bookings(user_id,payment_code,total_price) values($1,$2,100000) returning id",[ids[user],code])).rows[0].id
  }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create function public.is_admin() returns boolean language sql stable as $$ select auth.uid()='${ids.admin}'::uuid $$;
      create function public.admin_log(text,text,text,jsonb default '{}') returns void language sql as $$ select $$;
      create table public.itineraries(id uuid primary key,user_id uuid references auth.users(id),days jsonb default '[]',is_public boolean default false);
      create table public.bookings(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),payment_code text unique,
        total_price bigint,payment_status text default 'pending',payment_provider text,payment_txn_ref text,paid_at timestamptz,
        created_at timestamptz default now(),fulfillment_status text default 'awaiting');
      alter table public.bookings enable row level security;
      grant select on public.bookings to authenticated;
      create policy own_bookings on public.bookings for select to authenticated using(user_id=auth.uid());
      create table public.payment_transactions(id bigint primary key,provider text,booking_id uuid references public.bookings(id),payment_code text,
        amount bigint,content text,reference_code text,account_number text,gateway text,transaction_date timestamptz,raw jsonb,outcome text);
      alter table public.payment_transactions enable row level security;
      grant select on public.payment_transactions to authenticated;
      create policy admin_transfers on public.payment_transactions for select to authenticated using(public.is_admin());
      create table public.properties(active boolean,inventory_enabled boolean);
      create table public.tour_operators(id uuid primary key,status text);
      create table public.tours(operator_id uuid,published boolean);
      create table public.reviews(kind text,booking_id uuid,rating integer,comment text);
      create table public.partner_applications(status text);
      create table public.community_posts(id uuid); create table public.community_comments(id uuid);
      create table public.contact_messages(handled_at timestamptz);
      create table public.newsletter_subscribers(id uuid); create table public.video_reviews(id uuid);
      create table public.saved_places(id uuid);
      alter default privileges in schema public grant execute on functions to anon,authenticated;
    `)
    for (const id of Object.values(ids)) await db.query('insert into auth.users(id) values($1)',[id])
    await db.query('insert into public.itineraries(id,user_id) values($1,$2)',[tripId,ids.owner])
    for (const file of ['20261013090000_live_trip_rooms.sql','20261013100000_sepay_mock_atomic.sql','20261013110000_runtime_readiness.sql']) {
      await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
    }
    let room,newToken
    await t.test('only the trip owner creates a room; private trips stay private', async () => {
      await as(); await assert.rejects(rpc('create_live_trip',[tripId]),/permission denied/)
      await as('other'); await assert.rejects(rpc('create_live_trip',[tripId]),/not-your-trip/)
      await as('owner'); room=await rpc('create_live_trip',[tripId])
      assert.match(room.token,/^[a-f0-9]{64}$/)
      await db.exec('reset role'); assert.equal((await db.query('select is_public from public.itineraries where id=$1',[tripId])).rows[0].is_public,false)
    })
    await t.test('GPS reads and writes require room membership; direct tables are inaccessible', async () => {
      await as('other'); await assert.rejects(rpc('live_trip_state',[room.id]),/room-unavailable/)
      await assert.rejects(rpc('live_trip_publish',[room.id,'Other',{lat:10,lng:106}]),/room-unavailable/)
      await assert.rejects(db.query('select * from public.live_trip_locations'),/permission denied/)
      await assert.rejects(rpc('join_live_trip',[crypto.randomUUID(),room.token,'Other']),/room-unavailable/)
      await as('member'); await rpc('join_live_trip',[tripId,room.token,'Member'])
      await rpc('join_live_trip',[tripId,room.token,'Member'])
      const state=await rpc('live_trip_state',[room.id]); assert.equal(state.members.length,2)
      assert.equal(state.trip.id,tripId)
      await rpc('live_trip_publish',[room.id,'Member',{lat:10,lng:106,accuracy:8,user_id:ids.other}])
      assert.equal((await rpc('live_trip_state',[room.id])).members.find((m)=>m.id===ids.member).location.lat,10)
      await assert.rejects(rpc('live_trip_publish',[room.id,'Member',{lat:999,lng:106}]),/check constraint/)
      await rpc('live_trip_publish',[room.id,'Member',null])
      assert.equal((await rpc('live_trip_state',[room.id])).members.find((m)=>m.id===ids.member).sharing,false)
    })
    await t.test('rotating invites, removing members, stopping GPS and closing rooms are enforced server-side', async () => {
      await as('member'); await assert.rejects(rpc('manage_live_trip',[room.id,'close',null]),/owners-only/)
      await rpc('live_trip_publish',[room.id,'Member',{lat:10,lng:106}])
      await as('owner'); newToken=(await rpc('manage_live_trip',[room.id,'rotate',null])).token
      await as('other'); await assert.rejects(rpc('join_live_trip',[tripId,room.token,'Other']),/room-unavailable/)
      await as('owner'); await rpc('manage_live_trip',[room.id,'remove',ids.member])
      await as('member'); await assert.rejects(rpc('live_trip_state',[room.id]),/room-unavailable/)
      await assert.rejects(rpc('join_live_trip',[tripId,newToken,'Member']),/membership-revoked/)
      await assert.rejects(rpc('live_trip_publish',[room.id,'Member',{lat:10,lng:106}]),/room-unavailable/)
      await as('owner'); await rpc('manage_live_trip',[room.id,'close',null])
      await assert.rejects(rpc('live_trip_state',[room.id]),/room-unavailable/)
      await db.exec('reset role'); assert.equal((await db.query('select count(*)::int as n from public.live_trip_locations')).rows[0].n,0)
    })
    await t.test('stale fixes are hidden and purged without storing a history', async () => {
      await as('owner'); const r=await rpc('create_live_trip',[tripId])
      await rpc('live_trip_publish',[r.id,'Owner',{lat:10,lng:106}])
      await rpc('live_trip_publish',[r.id,'Owner',{lat:11,lng:107}])
      await db.exec('reset role'); assert.equal((await db.query('select count(*)::int as n from public.live_trip_locations')).rows[0].n,1)
      await db.query("update public.live_trip_locations set updated_at=now()-interval '2 minutes'")
      await as('owner'); assert.equal((await rpc('live_trip_state',[r.id])).members[0].sharing,false)
      await db.exec('reset role'); await rpc('purge_live_trip_locations')
      assert.equal((await db.query('select count(*)::int as n from public.live_trip_locations')).rows[0].n,0)
    })
    await t.test('mock payments need explicit activation and ownership; no anonymous or arbitrary settlement', async () => {
      const id=await booking('owner','FT0000000001')
      await as('owner'); await assert.rejects(rpc('mock_sepay_transfer',[id,crypto.randomUUID(),'exact']),/mock-disabled/)
      await assert.rejects(rpc('apply_sepay_transfer',[{id:1,transferAmount:100000},'A',false]),/permission denied/)
      await db.exec('reset role'); await db.exec("insert into private.settings values('payment_mode','sepay-mock')")
      await as(); await assert.rejects(rpc('mock_sepay_transfer',[id,crypto.randomUUID(),'exact']),/permission denied/)
      await as('other'); await assert.rejects(rpc('mock_sepay_transfer',[id,crypto.randomUUID(),'exact']),/not-your-booking/)
    })
    await t.test('mock underpayment plus remainder pays once; duplicate delivery is idempotent and marked DEMO', async () => {
      const id=await booking('owner','FT0000000002')
      await as('owner'); assert.equal((await rpc('mock_sepay_transfer',[id,crypto.randomUUID(),'underpaid'])).outcome,'underpaid')
      const key=crypto.randomUUID()
      assert.equal((await rpc('mock_sepay_transfer',[id,key,'remaining'])).outcome,'paid')
      assert.equal((await rpc('mock_sepay_transfer',[id,key,'remaining'])).duplicate,true)
      await assert.rejects(rpc('mock_sepay_transfer',[id,key,'exact']),/request-key-conflict/)
      const b=(await db.query('select * from public.bookings where id=$1',[id])).rows[0]
      assert.equal(b.payment_status,'paid'); assert.equal(b.payment_txn_ref,'DEMO')
      await as('admin')
      const tx=(await db.query("select id from public.payment_transactions where booking_id=$1 and outcome='paid-partial'",[id])).rows[0].id
      await assert.rejects(rpc('admin_match_payment',[tx,'FT0000000002']),/mock-transfer-not-matchable/)
    })
    await t.test('wrong note/account cannot pay; real webhook retries and partial transfers use the same atomic processor', async () => {
      const id=await booking('owner','FT0000000003')
      await as('owner')
      assert.equal((await rpc('mock_sepay_transfer',[id,crypto.randomUUID(),'wrong-code'])).outcome,'no-booking')
      assert.equal((await rpc('mock_sepay_transfer',[id,crypto.randomUUID(),'wrong-account'])).outcome,'wrong-account')
      assert.equal((await db.query('select payment_status from public.bookings where id=$1',[id])).rows[0].payment_status,'pending')
      const real=await booking('other','FT0000000004')
      await as('service')
      const transfer={id:123,transferAmount:40000,transferType:'in',content:'FT0000000004',accountNumber:'EXPECTED'}
      assert.equal((await rpc('apply_sepay_transfer',[transfer,'EXPECTED',false])).outcome,'underpaid')
      assert.equal((await rpc('apply_sepay_transfer',[transfer,'EXPECTED',false])).duplicate,true)
      assert.equal((await rpc('apply_sepay_transfer',[{...transfer,id:124,transferAmount:60000},'EXPECTED',false])).outcome,'paid')
      await as('admin'); await assert.rejects(rpc('admin_match_payment',[123,'FT0000000003']),/transaction-already-handled/)
      await db.exec('reset role')
      assert.equal((await db.query('select payment_txn_ref from public.bookings where id=$1',[real])).rows[0].payment_txn_ref,'SEPAY-124')
    })
    await t.test('a database failure rolls back the receipt claim so a retry can finish', async () => {
      const id=await booking('owner','FT0000000005')
      await db.exec(`create function fail_payment() returns trigger language plpgsql as $$ begin raise exception 'simulated-storage-error'; end $$;
        create trigger fail_payment before update on public.bookings for each row execute function fail_payment();`)
      await as('service')
      const tx={id:125,transferAmount:100000,transferType:'in',content:'FT0000000005',accountNumber:'EXPECTED'}
      await assert.rejects(rpc('apply_sepay_transfer',[tx,'EXPECTED',false]),/simulated-storage-error/)
      await db.exec('reset role'); assert.equal((await db.query('select count(*)::int as n from public.payment_transactions where id=125')).rows[0].n,0)
      await db.exec('drop trigger fail_payment on public.bookings')
      await as('service'); assert.equal((await rpc('apply_sepay_transfer',[tx,'EXPECTED',false])).outcome,'paid')
      await db.exec('reset role'); assert.equal((await db.query('select payment_status from public.bookings where id=$1',[id])).rows[0].payment_status,'paid')
    })
    await t.test('diagnostics are admin-only and mock stays cannot create verified reviews', async () => {
      await as(); await assert.rejects(rpc('admin_runtime_status'),/permission denied/)
      await as('owner'); await assert.rejects(rpc('admin_runtime_status'),/not-admin/)
      await as('admin'); const state=await rpc('admin_runtime_status')
      assert.equal(state.mock_payments,true); assert.equal(state.live_rooms,true)
      assert.equal(state.jobs.length,7); assert.equal(state.jobs.every((j)=>!j.active),true)
      assert.equal('settings' in state,false)
      assert.equal((await rpc('admin_overview')).revenue_paid,200000)
      await db.exec('reset role')
      const mock=(await db.query("select id from public.bookings where payment_txn_ref='DEMO' limit 1")).rows[0].id
      await assert.rejects(db.query("insert into public.reviews(kind,booking_id,rating,comment) values('stay',$1,5,'Test')",[mock]),/mock-booking-not-reviewable/)
    })
  } finally { await db.close() }
})
