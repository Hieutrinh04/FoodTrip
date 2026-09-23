import test from 'node:test'
import assert from 'node:assert/strict'

import { optimiseDayRouteByRoad } from '../src/lib/routeOptimizer.js'

const slots = ['07:00', '09:00', '12:00', '15:00'].map((time) => ({ time, categories: ['food'] }))

function entry(id, lng, slot) {
  return {
    place: { id, category: 'food', hours: { open: '00:00', close: '24:00' } },
    location: { lat: 0, lng },
    slot,
  }
}

test('road optimiser chooses the lowest provider travel time and includes fixed anchors', async () => {
  const entries = [
    entry('a', 1, slots[0]),
    entry('b', 2, slots[1]),
    entry('c', 3, slots[2]),
    entry('d', 4, slots[3]),
  ]
  const calls = []
  const result = await optimiseDayRouteByRoad(entries, () => true, {
    startLocation: { lat: 0, lng: 0 },
    endLocation: { lat: 0, lng: 5 },
    candidateLimit: 24,
    fetchRouteDetails: async (points) => {
      const key = points.map((point) => point.lng).join('-')
      calls.push(key)
      const durationSeconds = key === '0-4-2-3-1-5' ? 100 : 1000
      return {
        distanceMeters: durationSeconds * 10,
        durationSeconds,
        legs: points.slice(1).map(() => ({ distanceMeters: 100, durationSeconds: 10 })),
      }
    },
  })

  assert.equal(result.usedRoadRouting, true)
  assert.deepEqual(result.entries.map((item) => item.place.id), ['d', 'b', 'c', 'a'])
  assert.ok(calls.every((key) => key.startsWith('0-') && key.endsWith('-5')))
  assert.equal(result.routeDetails.durationSeconds, 100)
})

test('road optimiser falls back safely when the provider is unavailable', async () => {
  const entries = [
    entry('a', 4, slots[0]),
    entry('b', 1, slots[1]),
    entry('c', 3, slots[2]),
    entry('d', 2, slots[3]),
  ]
  let calls = 0
  const result = await optimiseDayRouteByRoad(entries, () => true, {
    fetchRouteDetails: async () => {
      calls += 1
      return null
    },
  })

  assert.equal(result.usedRoadRouting, false)
  assert.equal(result.routeDetails, null)
  assert.equal(result.entries.length, entries.length)
  assert.equal(calls, 1)
})
