import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchExplorePlaces } from '../src/lib/explorePlaceSearch.js'
import { searchMapArea } from '../src/lib/mapAreaSearch.js'
import { destinationWeatherLocation } from '../src/lib/tripWeather.js'

test('Explore city searches use the known centre without requesting GPS or geocoding', async () => {
  let received
  const place = { id: 'fixture' }
  const result = await searchExplorePlaces({ foodType: 'pho', city: { id: 'hanoi', name: { vi: 'Hà Nội' } } }, {
    search: async (args) => { received = args; return { places: [place] } },
    geocode: () => assert.fail('Known centre does not need geocoding'),
  })
  assert.deepEqual(received.origin, destinationWeatherLocation('hanoi'))
  assert.equal(received.radiusKm, 5)
  assert.equal(received.keyword, 'quán phở')
  assert.deepEqual(result, [place])
})

test('custom city geocodes once before Google search and explicit GPS always wins', async () => {
  const point = { lat: 13, lng: 109 }
  for (const origin of [null, { lat: 21, lng: 105 }]) {
    let lookups = 0
    await searchExplorePlaces({ query: 'bánh xèo', city: { id: 'custom', name: { vi: 'Quy Nhơn' } }, origin }, {
      geocode: async (query, options) => { assert.equal(query, 'Quy Nhơn'); assert.equal(options.limit, 1); lookups++; return [{ location: point }] },
      search: async (args) => { assert.deepEqual(args.origin, origin ?? point); return { places: [{ id: 'match' }] } },
    })
    assert.equal(lookups, origin ? 0 : 1)
  }
})

test('failed city geocoding skips the known-empty Google area-only query', async () => {
  const result = await searchExplorePlaces({ query: 'phở', city: { id: 'custom', name: { vi: 'Unknown city' } } }, {
    geocode: async () => [], search: () => assert.fail('Do not issue an area-only Google search'),
  })
  assert.deepEqual(result, [])
})

test('map cache ignores old empty results and caches only nonempty successful results', async () => {
  const stored = new Map()
  let calls = 0, writes = 0
  const storage = { getItem: (key) => stored.get(key) ?? JSON.stringify({ time: Date.now(), places: [] }), setItem: (key, value) => { writes++; stored.set(key, value) } }
  const args = { keyword: 'phở', origin: { lat: 21, lng: 105 } }
  const invoke = async () => { calls++; return { data: { status: 'ok', places: calls < 3 ? [] : [{ placeId: 'fixture', name: 'Phở fixture', address: 'Fixture', location: args.origin, rating: 4.5, ratingCount: 10 }] } } }
  assert.deepEqual((await searchMapArea(args, { storage, invoke })).places, [])
  assert.deepEqual((await searchMapArea(args, { storage, invoke })).places, [])
  assert.equal(writes, 0)
  assert.equal((await searchMapArea(args, { storage, invoke })).places.length, 1)
  assert.equal((await searchMapArea(args, { storage, invoke })).places.length, 1)
  assert.equal(calls, 3)
  assert.equal(writes, 1)
})
