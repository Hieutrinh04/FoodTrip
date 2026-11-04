import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchCityCounts, sampleEateries, sampleSights, topCatalogPlaces } from '../src/lib/cityStats.js'
import { CITIES } from '../src/data/destinations.js'

test('kept-venue counts map the saved city text onto city ids', async () => {
  const rpc = async () => ({ data: [{ city: 'Hà Nội', places: '17' }, { city: 'TP. Hồ Chí Minh', places: 13 }, { city: 'Sài Gòn', places: 2 }, { city: 'Bình Dương', places: 1 }, { city: 'Huế', places: 0 }], error: null })
  assert.deepEqual(await fetchCityCounts({ rpc }), { hanoi: 17, hcmc: 15 })
})

test('no figure rather than a false zero when counts are unavailable', async () => {
  assert.equal(await fetchCityCounts({ rpc: null }), null)
  assert.equal(await fetchCityCounts({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) }), null)
  assert.equal(await fetchCityCounts({ rpc: async () => { throw new Error('offline') } }), null)
})

test('top kept places: eateries of this city, rated, trusted by review count', () => {
  const p = (id, city, rating, count, type = 'Nhà hàng') => ({ id, city, category: 'food', shortDesc: { vi: type }, googleRating: rating, googleRatingCount: count })
  const top = topCatalogPlaces([p('a', 'hanoi', 5, 2), p('b', 'hanoi', 4.4, 3000), p('c', 'hue', 4.9, 900), p('d', 'hanoi', null, 0), p('e', 'hanoi', 4.6, 900), p('lagoon', 'hanoi', 4.9, 5000, 'Lagoon'), p('mall', 'hanoi', 4.8, 4000, 'Trung tâm mua sắm'), p('unknown', 'hanoi', 4.8, 4000, 'Địa điểm trên bản đồ')], 'hanoi')
  assert.deepEqual(top.map((x) => x.id), ['e', 'b', 'a'])
})

test('sample places stay apart from kept venues, eateries apart from sights', () => {
  for (const city of CITIES) {
    assert.ok(sampleEateries(city.id).every((p) => ['food', 'cafe'].includes(p.category)))
    assert.ok(sampleSights(city.id).every((p) => p.category === 'attraction'))
  }
})

test('every city has a page and the home grid links to it', () => {
  assert.match(readFileSync('src/App.jsx', 'utf8'), /path="\/thanh-pho\/:cityId"/)
  const landing = readFileSync('src/pages/Landing.jsx', 'utf8')
  assert.match(landing, /to=\{`\/thanh-pho\/\$\{city\.id\}`\}/)
  assert.match(landing, /id="thanh-pho"/)
})
