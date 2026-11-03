import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Every migration, replayed in order on a real in-memory PostgreSQL. Only what
// hosted Supabase provides is stubbed (auth, storage, pg_cron); no remote data.
const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url)
const SUPABASE_STUBS = `
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema storage; create schema extensions; create schema cron;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select current_user::text $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  create publication supabase_realtime;
  create table cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values(n,s,c) on conflict(jobname) do update set schedule=excluded.schedule, command=excluded.command returning jobid $$;
  create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
  grant usage on schema auth, public, storage to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  -- Hosted Supabase grants directly to the API roles, not only to PUBLIC.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`
const NAMES = ['admin', 'owner', 'staff', 'otherOwner', 'tourOwner', 'tourManager', 'guide', 'customer', 'stranger']
const users = Object.fromEntries(NAMES.map((name, i) => [name, `00000000-0000-4000-8000-0000000000${String(i + 10)}`]))

test('all migrations on one schema: tenants, roles and private data', async (t) => {
  const db = new PGlite()
  async function as(name) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[name] ?? ''])
    await db.exec(name ? 'set role authenticated' : 'set role anon')
  }
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows
  const denied = (sql, args = []) => assert.rejects(db.query(sql, args), /permission denied|not-|owners-only|only|forbidden|row-level security/i, sql)
  try {
    await db.exec(SUPABASE_STUBS)
    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      const sql = await readFile(new URL(file, MIGRATIONS), 'utf8')
      await assert.doesNotReject(db.exec(sql.replace(/create extension[^;]*;/gi, '')), file)
    }
    for (const [name, id] of Object.entries(users)) await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${name}@example.test`])
    await db.query('insert into public.admin_users(user_id) values($1)', [users.admin])
    const [{ id: property }] = await rows("insert into public.properties(hotel_place_id,name) values('hotel-a','Hotel A') returning id")
    const [{ id: otherProperty }] = await rows("insert into public.properties(hotel_place_id,name) values('hotel-b','Hotel B') returning id")
    await db.query("insert into public.property_managers(property_id,user_id,role) values($1,$2,'owner'),($1,$3,'staff'),($4,$5,'owner')", [property, users.owner, users.staff, otherProperty, users.otherOwner])
    const [{ id: operator }] = await rows("insert into public.tour_operators(applicant_id,name,contact,status) values($1,'Operator A','0900000000','approved') returning id", [users.tourOwner])
    await db.query("insert into public.tour_members(operator_id,user_id,role) values($1,$2,'owner'),($1,$3,'manager'),($1,$4,'guide')", [operator, users.tourOwner, users.tourManager, users.guide])
    const trip = (who, isPublic) => rows("insert into public.itineraries(user_id,duration,budget,people,transport,days,is_public) values($1,1,1,1,'motorbike','[]',$2) returning id", [users[who], isPublic])
    const [{ id: privateTrip }] = await trip('customer', false)
    const [{ id: sharedTrip }] = await trip('customer', true)
    await db.query("insert into public.notifications(user_id,kind,title,body) values($1,'k','t','private')", [users.customer])
    await db.query("insert into public.contact_messages(name,email,message) values('A','a@example.test','private message')")
    await db.query("insert into public.newsletter_subscribers(email) values('a@example.test')")

    await t.test('every public table has row level security on', async () => {
      await db.exec('reset role')
      const open = await rows("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")
      assert.deepEqual(open, [])
    })

    await t.test('no admin function answers a guest or an ordinary account', async () => {
      await db.exec('reset role')
      const fns = await rows("select p.proname, p.pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin\\_%' and p.proname <> 'admin_log_delete' and p.prorettype <> 'trigger'::regtype")
      assert.ok(fns.length > 15, 'admin functions were found')
      for (const who of [null, 'customer', 'owner', 'tourOwner']) {
        await as(who)
        for (const { proname, pronargs } of fns) await denied(`select public.${proname}(${Array(pronargs).fill('null').join(',')})`)
      }
    })

    await t.test('the admin role itself cannot be granted by a non-admin', async () => {
      await as('customer')
      await denied('select public.admin_set_admin($1,true)', [users.customer])
      await denied('insert into public.admin_users(user_id) values($1)', [users.customer])
    })

    await t.test('property revenue and team: owner only, never staff or another tenant', async () => {
      await as('owner'); await db.query('select public.property_statement($1)', [property])
      assert.equal((await rows('select public.property_team($1) as team', [property]))[0].team.length, 2)
      for (const who of ['staff', 'otherOwner', 'customer', 'tourOwner']) {
        await as(who)
        await denied('select public.property_statement($1)', [property])
        assert.deepEqual((await rows('select public.property_team($1) as team', [property]))[0].team, [], who)
      }
      await as('staff')
      assert.deepEqual((await rows('select public.property_team($1) as team', [otherProperty]))[0].team, [], 'staff cannot read another team either')
      await denied("select public.owner_set_property_staff($1,'stranger@example.test',true)", [property])
      await as('otherOwner')
      await denied("select public.owner_set_property_staff($1,'stranger@example.test',true)", [property])
    })

    await t.test('tour terms and profile belong to the operator owner, not manager or guide', async () => {
      await db.exec('reset role')
      const [{ version }] = await rows("select version from public.partner_terms where kind='tour' order by version desc limit 1")
      for (const who of ['tourManager', 'guide', 'customer']) {
        await as(who)
        await denied('select public.tour_accept_terms($1,$2)', [operator, version])
        await denied('select public.tour_operator_update_profile($1,$2)', [operator, { description: 'x' }])
      }
      await as('tourOwner')
      await db.query('select public.tour_accept_terms($1,$2)', [operator, version])
      for (const who of ['guide', 'customer', 'owner']) { await as(who); await denied('select public.operator_statement($1)', [operator]) }
    })

    await t.test('private rows stay with their owner', async () => {
      for (const who of [null, 'stranger', 'owner']) {
        await as(who)
        assert.equal((await rows('select id from public.itineraries where id=$1', [privateTrip])).length, 0)
        if (who === null) await denied('select id from public.notifications')
        else assert.equal((await rows('select id from public.notifications')).length, 0)
        assert.equal((await rows('select id from public.contact_messages')).length, 0)
        assert.equal((await rows('select email from public.newsletter_subscribers')).length, 0)
      }
      await as('stranger')
      assert.equal((await rows('update public.itineraries set is_public=true where id=$1 returning id', [privateTrip])).length, 0)
      assert.equal((await rows('delete from public.itineraries where id=$1 returning id', [sharedTrip])).length, 0)
    })

    await t.test('a shared trip opens by its link only and cannot be listed', async () => {
      for (const who of [null, 'stranger']) {
        await as(who)
        const [{ trip: opened }] = await rows('select public.shared_itinerary($1) as trip', [sharedTrip])
        assert.equal(opened.id, sharedTrip)
        assert.equal('user_id' in opened, false, 'the owner is not exposed')
        assert.equal((await rows('select public.shared_itinerary($1) as trip', [privateTrip]))[0].trip, null)
        assert.equal((await rows('select id from public.itineraries where is_public')).length, 0, 'public trips cannot be enumerated')
        assert.deepEqual(await rows('select id,user_id from public.itineraries where id=$1', [sharedTrip]), [], 'knowing the id does not authorize direct table reads')
        assert.deepEqual(await rows('select id,user_id from public.itineraries'), [], 'unfiltered list cannot expose an owner')
        assert.equal((await rows('select public.shared_itinerary($1) as trip', ['00000000-0000-4000-8000-000000000099']))[0].trip, null, 'unknown links fail closed')
      }
      await as('customer')
      assert.equal((await rows('select id from public.itineraries')).length, 2, 'the owner still sees both')
      await rows('update public.itineraries set is_public=false where id=$1 returning id', [sharedTrip])
      await as(null)
      assert.equal((await rows('select public.shared_itinerary($1) as trip', [sharedTrip]))[0].trip, null, 'revoking closes the link')
      await as('stranger')
      assert.equal((await rows('select public.shared_itinerary($1) as trip', [sharedTrip]))[0].trip, null, 'revocation also applies to another authenticated account')
    })

    await t.test('community: only the author or an admin removes a post', async () => {
      await as('customer')
      const [{ id: post }] = await rows("insert into public.community_posts(author_name,body,place_name,address,lat,lng) values('An','Hello','Quan A','1 Pho',21,105) returning id")
      await as(null)
      await denied("insert into public.community_posts(user_id,author_name,body,place_name,address,lat,lng) values($1,'An','x','Quan','1 Pho',21,105)", [users.customer])
      await as('stranger')
      assert.equal((await rows('delete from public.community_posts where id=$1 returning id', [post])).length, 0)
      assert.equal((await rows("update public.community_posts set body='hacked' where id=$1 returning id", [post])).length, 0)
      await denied("insert into public.community_posts(user_id,author_name,body,place_name,address,lat,lng) values($1,'An','x','Quan','1 Pho',21,105)", [users.customer])
      await as('admin')
      assert.equal((await rows('delete from public.community_posts where id=$1 returning id', [post])).length, 1)
    })
  } finally {
    await db.close()
  }
})
