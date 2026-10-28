import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placesForDestination, loadPlannerCatalog, plannerPool } from '../src/lib/plannerCatalog.js'
import { catalogPlace } from '../src/lib/placeCatalog.js'
import { generateItinerary } from '../src/lib/itineraryEngine.js'
import { getPlace } from '../src/data/destinations.js'
import { normalizeItinerary } from '../src/lib/itineraries.js'
import { getReplacementCandidates, replaceStopPlace } from '../src/lib/itineraryEdit.js'

const dbPlace = (id, over = {}) => catalogPlace({ place_id: id, name: `Quán ${id}`, address: `${id} Đà Lạt`, city: 'Đà Lạt', lat: 11.94, lng: 108.44, rating: 4.9, rating_count: 2000, category: 'Nhà hàng', ...over })
const offline = {
  expand: async (_id, p) => p,
  enrich: async () => null,
  route: async () => null,
}
const request = { cityId: 'dalat', duration: 1, budget: 1500000, prefs: [], transport: 'bike' }

test('planner loads only saved venues of the requested city or custom destination', async () => {
  const dalat = dbPlace('dl'), hanoi = dbPlace('hn', { city: 'Hà Nội', address: 'Hà Nội' })
  const hoian = dbPlace('ha', { city: 'Hội An', address: 'Hội An, Đà Nẵng' })
  const camau = dbPlace('cm', { city: 'Cà Mau', address: 'An Xuyên, Cà Mau' })
  const all = [dalat, hanoi, hoian, camau]
  assert.deepEqual(placesForDestination(all, { cityId: 'dalat' }).map((p) => p.googlePlaceId), ['dl'])
  assert.deepEqual(placesForDestination(all, { cityId: 'danang' }), [])
  assert.deepEqual(placesForDestination(all, { destinationName: 'Cà Mau' }).map((p) => p.googlePlaceId), ['cm'])
  assert.deepEqual(placesForDestination(all, {}), [])
  assert.equal((await loadPlannerCatalog({ cityId: 'dalat' }, { load: async () => { throw new Error('offline') } })).status, 'error')
})

test('a DB-only venue can be selected by itinerary scoring, retains Google facts, and is available for swaps', async () => {
  const stored = [dbPlace('db-lunch'), dbPlace('db-dinner'), dbPlace('db-breakfast')]
  let pool, catalog
  const days = await generateItinerary({ ...request, onCandidates: (p) => { pool = p }, onCatalog: (c) => { catalog = c } }, {
    ...offline, loadCatalog: async () => ({ status: 'ready', places: stored }),
  })
  assert.equal(catalog.status, 'ready')
  assert.ok(pool.some((p) => p.id === stored[0].id))
  const selected = days.flat().find((s) => stored.some((p) => p.id === s.placeId))
  assert.ok(selected, 'a strong DB venue should beat weaker sample candidates')
  assert.equal(selected.liveRating, 4.9)
  assert.equal(selected.liveReviewCount, 2000)
  assert.equal(selected.placeSnapshot.name.vi, getPlace(selected.placeId).name.vi)
  assert.equal(selected.placeSnapshot.rating, null)
  assert.equal(selected.placeSnapshot.hours, null, 'unknown hours remain unknown')
  const swaps = getReplacementCandidates({ candidatePlaces: pool, category: 'food', usedPlaceIds: new Set() })
  assert.ok(swaps.some((p) => p.id === stored[0].id))
  const replaced = await replaceStopPlace(selected, pool.find((p) => p.id === stored[0].id), 'dalat')
  assert.equal(replaced.liveRating, 4.9)
  assert.equal(replaced.placeSnapshot.id, stored[0].id)
})

test('custom destination selections keep DB entries and never re-add unchecked places', async () => {
  const selected = plannerPool([], [dbPlace('custom-cm', { city: 'Cà Mau', address: 'Cà Mau' })])
  const unselected = dbPlace('not-selected')
  let pool
  const days = await generateItinerary({ ...request, cityId: undefined, places: selected, onCandidates: (p) => { pool = p } }, {
    ...offline, loadCatalog: async () => ({ status: 'ready', places: [unselected] }),
  })
  assert.equal(pool.length, 1)
  assert.equal(pool[0].id, selected[0].id)
  assert.ok(days.flat().every((s) => s.placeId === selected[0].id))
})

test('saved/public trip snapshots rehydrate catalogue venues without a new provider lookup', () => {
  const place = dbPlace('reload-snapshot')
  assert.equal(getPlace(place.id), undefined)
  const row = JSON.parse(JSON.stringify({ id: 'trip', days: [[{ placeId: place.id, placeSnapshot: place }]] }))
  const trip = normalizeItinerary(row)
  assert.equal(trip.id, 'trip')
  assert.equal(getPlace(place.id).name.vi, place.name.vi)
  assert.equal(getPlace(place.id).googleRating, 4.9)
})

test('catalogue failure reports fallback and still builds from available city data', async () => {
  let status
  const days = await generateItinerary({ ...request, onCatalog: (r) => { status = r.status } }, {
    ...offline, loadCatalog: async () => ({ status: 'error', places: [] }),
  })
  assert.equal(status, 'error')
  assert.ok(days.flat().length)
})
