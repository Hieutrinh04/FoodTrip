import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placePrice, knownClosingTime, isCuratedPlace } from '../src/lib/pricing.js'

const curated = { id: 'hn-pho-thin', city: 'hanoi', price: 1, hours: { open: '06:00', close: '21:00' } }
const google = { id: 'gmaps-x', source: 'google-maps', price: null, priceLevel: null, hours: { open: '00:00', close: '24:00' }, weeklyHours: null }
const custom = { id: 'ta-1', city: 'custom', price: 1, rating: 4, hours: { open: '00:00', close: '24:00' } }

test('a trip shows only prices someone actually gave', () => {
  assert.deepEqual(placePrice(curated, 'vi'), { label: '20.000đ – 60.000đ', known: true })
  assert.deepEqual(placePrice({ ...curated, price: 0 }, 'en'), { label: 'Free', known: true })
  // Google's own wording wins when it gives one.
  assert.deepEqual(placePrice({ ...google, priceLevel: '100–200 N ₫' }, 'vi'), { label: '100–200 N ₫', known: true })
  // Live-search places: no made-up range, even with an old placeholder tier stored.
  assert.deepEqual(placePrice(google, 'vi'), { label: 'Chưa có giá', known: false })
  assert.deepEqual(placePrice(custom, 'en'), { label: 'Price unknown', known: false })
  assert.equal(isCuratedPlace(custom), false)
  assert.equal(isCuratedPlace(curated), true)
})

test('closing time only when the hours are real', () => {
  assert.equal(knownClosingTime(curated), '21:00')
  assert.equal(knownClosingTime(google), null, 'the always-open placeholder is not shown')
  assert.equal(knownClosingTime({ ...google, hours: { open: '07:00', close: '21:30' }, weeklyHours: [{ weekday: 1 }] }), '21:30')
  assert.equal(knownClosingTime(custom), null)
})
