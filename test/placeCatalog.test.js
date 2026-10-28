import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { catalogPlace, fetchPlaceCatalog, matchesCatalogQuery, mergePlaceCatalog } from '../src/lib/placeCatalog.js'

const row = (over = {}) => ({ place_id: 'google-1', name: 'Quán cơm Linh', address: '23 Sương Nguyệt Anh, Đà Lạt', city: 'Đà Lạt', lat: 11.95, lng: 108.45, category: 'Nhà hàng cơm', rating: '4.8', rating_count: 1528, ...over })

test('database venues have real Google facts and appear in the same map-card shape as live results', () => {
  const p = catalogPlace(row())
  assert.equal(p.googlePlaceId, 'google-1')
  assert.equal(p.city, 'dalat')
  assert.equal(p.googleRating, 4.8)
  assert.equal(p.rating, null)
  assert.deepEqual(p.reviews, [])
  assert.equal(p.source, 'google-maps')
  assert.equal(p.inCatalog, true)
  assert.equal(p.hours, null, 'missing opening hours must not become 24-hour opening')
  assert.equal(catalogPlace(row({ lat: null })), null)
  assert.equal(catalogPlace(row({ lat: 100 })), null)
  assert.equal(catalogPlace(row({ category: 'Hotel' })), null)
  assert.equal(matchesCatalogQuery(p, 'quan com linh'), true)
  assert.equal(matchesCatalogQuery(catalogPlace(row({ name: 'Bánh Mì Phượng'.normalize('NFD') })), 'Bánh Mì Phượng'), true)
})

test('catalogue deduplicates Google ids and overlapping sample entries, but preserves separate branches', () => {
  const first = catalogPlace(row())
  const seed = { id: 'seed-linh', name: { vi: 'Quán cơm Linh' }, address: { vi: row().address } }
  const branch = catalogPlace(row({ place_id: 'google-2', address: '11 Hùng Vương, Đà Lạt' }))
  const merged = mergePlaceCatalog([seed], [first, { ...first, googleRating: 4.9 }, branch])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].googleRating, 4.9)
  assert.equal(mergePlaceCatalog(merged, [first]).length, 2)
})

test('catalogue reads all pages and refuses to silently hide a database error', async () => {
  const calls = []
  const places = await fetchPlaceCatalog({ rpc: async (args) => {
    calls.push(args)
    return { data: !args.p_after ? Array.from({ length: 500 }, (_, i) => row({ place_id: `id-${String(i).padStart(3, '0')}`, name: `Place ${i}`, address: `Street ${i}` })) : [row({ place_id: 'last', name: 'Last Place', address: 'Last Street' })] }
  } })
  assert.equal(places.length, 501)
  assert.equal(calls[1].p_after, 'id-499')
  await assert.rejects(fetchPlaceCatalog({ rpc: async () => ({ error: new Error('migration missing') }) }), /catalog-unavailable/)
})

test('catalogue SQL exposes public facts without granting table access or anonymous writes', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      grant usage on schema public to anon, authenticated;`)
    for (const file of ['20261021090000_share_place_memory.sql', '20261021110000_known_places_details.sql', '20261028110000_public_place_catalog.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await db.exec(`insert into public.known_places(place_id,name,core,lat,lng) values
      ('branch-a','Quán A','quan a',11.95,108.45),('branch-b','Quán B','quan b',11.96,108.46),
      ('unlocated','Chưa định vị','chua dinh vi',null,null),('map:fake','Chưa xác định','chua xac dinh',11,108);
      insert into public.place_aliases(alias,place_id) values ('bi mat noi bo','branch-a');
      set role anon;`)
    const page = (await db.query('select * from public.place_catalog($1,$2)', ['', 1])).rows
    assert.equal(page.length, 1)
    assert.equal(page[0].place_id, 'branch-a')
    assert.equal('confirmations' in page[0], false)
    assert.equal('core' in page[0], false)
    assert.deepEqual((await db.query('select place_id from public.place_catalog($1,$2)', ['branch-a', 500])).rows.map((r) => r.place_id), ['branch-b'])
    await assert.rejects(db.query('select * from public.known_places'), /permission denied/)
    await assert.rejects(db.query('select * from public.place_aliases'), /permission denied/)
    await assert.rejects(db.query(`select public.remember_share_place('{}'::jsonb)`), /permission denied/)
    await db.exec('reset role')
    // The Google id is the primary key: replaying a lookup updates one row.
    await db.exec(`insert into public.known_places(place_id,name,core,lat,lng,rating) values('branch-a','Quán A','quan a',11.95,108.45,4.8)
      on conflict(place_id) do update set rating=excluded.rating`)
    assert.equal((await db.query("select count(*)::int as n from public.known_places where place_id='branch-a'")).rows[0].n, 1)
  } finally { await db.close() }
})
