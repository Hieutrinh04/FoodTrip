import test from 'node:test'
import assert from 'node:assert/strict'

import { parseTripRequestLocally } from '../src/lib/tripRequestLocal.js'

test('reads a curated city, days, party size, budget and a taste', () => {
  const r = parseTripRequestLocally('3 ngày ở Đà Lạt dưới 3 triệu, 2 người, thích cà phê')
  assert.equal(r.source, 'local')
  assert.equal(r.cityId, 'dalat')
  assert.equal(r.duration, 3)
  assert.equal(r.people, 2)
  assert.equal(r.budgetPerPerson, 3_000_000)
  assert.deepEqual(r.prefs, ['coffee'])
})

test('a per-day budget is scaled to the whole trip', () => {
  // "cuối tuần" is two days, so 1tr5 a day is 3tr for the trip.
  const r = parseTripRequestLocally('đi Hội An cuối tuần với người yêu, khoảng 1tr5 mỗi ngày')
  assert.equal(r.cityId, 'hoian')
  assert.equal(r.duration, 2)
  assert.equal(r.people, 2)
  assert.equal(r.budgetPerPerson, 3_000_000)
})

test('a whole-group budget is split between the travellers', () => {
  const r = parseTripRequestLocally('nhóm 4 người đi Sa Pa 3n2đ, cả nhóm 12 triệu, leo núi')
  assert.equal(r.cityId, 'sapa')
  assert.equal(r.duration, 3)
  assert.equal(r.people, 4)
  assert.equal(r.budgetPerPerson, 3_000_000)
  assert.deepEqual(r.prefs, ['nature'])
})

test('a decimal comma is read as a decimal, not two numbers', () => {
  // normalizeVi strips punctuation, which would turn this into "1 5 triệu".
  assert.equal(parseTripRequestLocally('Quy Nhơn 4 ngày, tầm 1,5 triệu').budgetPerPerson, 1_500_000)
  assert.equal(parseTripRequestLocally('Huế 2 ngày 800k').budgetPerPerson, 800_000)
})

test('an unknown destination is kept verbatim for the live search', () => {
  const r = parseTripRequestLocally('Đi Quy Nhơn 4 ngày, ăn chay')
  assert.equal(r.cityId, null)
  assert.equal(r.destinationQuery, 'Quy Nhơn')
  assert.deepEqual(r.prefs, ['vegetarian'])
})

test('transport is recognised, and a day count is not mistaken for money', () => {
  const r = parseTripRequestLocally('Lên lịch 3 ngày biển dưới 2 triệu, đi xe máy')
  assert.equal(r.transport, 'bike')
  assert.equal(r.duration, 3)
  assert.equal(r.budgetPerPerson, 2_000_000)
})

test('nothing recognisable is reported as empty rather than as a filled form', () => {
  const r = parseTripRequestLocally('xin chào')
  assert.equal(r.empty, true)
  assert.equal(r.duration, null)
  assert.equal(r.budgetPerPerson, null)
})
