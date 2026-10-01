import test from 'node:test'
import assert from 'node:assert/strict'

import { vnDate, vnTime, destinationNames, toursForTrip, tourDays, toursOverlap, clearTourHours, tourDurationLabel, budgetAfterTours } from '../src/lib/tourTrip.js'

// 08:00–11:30 on 2 Oct 2026, Vietnam time.
const morning = { id: 'a', title: 'Food tour phố cổ', destination: 'Hội An', starts_at: '2026-10-02T01:00:00Z', ends_at: '2026-10-02T04:30:00Z', price: 450000 }
const hoian = { name: { vi: 'Hội An', en: 'Hoi An' } }

test('dates and times are read in Vietnam time, not UTC', () => {
  // 23:30 UTC on the 1st is 06:30 on the 2nd in Vietnam.
  assert.equal(vnDate('2026-10-01T23:30:00Z'), '2026-10-02')
  assert.equal(vnTime('2026-10-01T23:30:00Z'), '06:30')
})

test('a tour is offered only in the destination and within the trip days', () => {
  const names = destinationNames(hoian, 'hoian')
  const elsewhere = { ...morning, id: 'b', title: 'Phố đêm', destination: 'Đà Nẵng' }
  const tooLate = { ...morning, id: 'c', starts_at: '2026-10-05T01:00:00Z', ends_at: '2026-10-05T04:00:00Z' }
  const { onTrip, otherDates } = toursForTrip([morning, elsewhere, tooLate], { names, startDate: '2026-10-01', duration: 3 })
  assert.deepEqual(onTrip.map((t) => t.id), ['a'])
  assert.deepEqual(otherDates.map((t) => t.id), ['c'])
})

test('a city is recognised under its other names', () => {
  const hcmc = { name: { vi: 'TP. Hồ Chí Minh', en: 'Ho Chi Minh City' } }
  const tour = { ...morning, destination: 'Sài Gòn' }
  assert.equal(toursForTrip([tour], { names: destinationNames(hcmc, 'hcmc'), startDate: '2026-10-01', duration: 3 }).onTrip.length, 1)
  // "an" alone must not match "Hội An" inside another word.
  const hue = { name: { vi: 'Huế', en: 'Hue' } }
  assert.equal(toursForTrip([morning], { names: destinationNames(hue, 'hue'), startDate: '2026-10-01', duration: 3 }).onTrip.length, 0)
})

test('a tour lands on its trip day', () => {
  assert.deepEqual(tourDays(morning, '2026-10-01'), { first: 1, last: 1 })
})

test('overlapping departures are detected, back-to-back ones are not', () => {
  const after = { ...morning, id: 'd', starts_at: '2026-10-02T04:30:00Z', ends_at: '2026-10-02T06:00:00Z' }
  const during = { ...morning, id: 'e', starts_at: '2026-10-02T03:00:00Z', ends_at: '2026-10-02T06:00:00Z' }
  assert.equal(toursOverlap(morning, after), false)
  assert.equal(toursOverlap(morning, during), true)
})

test('the itinerary keeps the tour hours free on the tour day only', () => {
  const day = () => ['07:00', '09:30', '12:00', '15:00', '19:00'].map((time) => ({ time }))
  const days = clearTourHours([day(), day()], [morning], '2026-10-01')
  assert.deepEqual(days[0].map((s) => s.time), ['07:00', '09:30', '12:00', '15:00', '19:00'])
  // Breakfast at 07:00 ends before the 08:00 pick-up; 09:30 is inside; lunch at 12:00 is after 11:30.
  assert.deepEqual(days[1].map((s) => s.time), ['07:00', '12:00', '15:00', '19:00'])
})

test('a tour length reads like a tour page: hours for a day trip, days and nights otherwise', () => {
  assert.equal(tourDurationLabel(morning), '3.5 giờ')
  assert.equal(tourDurationLabel({ starts_at: '2026-10-02T01:00:00Z', ends_at: '2026-10-03T10:00:00Z' }), '2 ngày 1 đêm')
})

test('the budget left for food and rooms is the budget less the chosen tours', () => {
  assert.equal(budgetAfterTours(1500000, [{ price: 450000 }, { price: '300000' }]), 750000)
  assert.equal(budgetAfterTours(500000, [{ price: 900000 }]), 0)
})
