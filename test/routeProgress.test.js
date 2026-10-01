import test from 'node:test'
import assert from 'node:assert/strict'

import { bearingDegrees, distanceMeters, locateOnRoute, splitRoute } from '../src/lib/routeProgress.js'

// An L-shaped route in Hà Nội: ~1.1 km north, then ~1.0 km east.
const A = [105.8500, 21.0200]
const B = [105.8500, 21.0300]
const C = [105.8600, 21.0300]
const ROUTE = [A, B, C]

test('distances and bearings are what a map would say', () => {
  assert.ok(Math.abs(distanceMeters({ lat: A[1], lng: A[0] }, { lat: B[1], lng: B[0] }) - 1112) < 5)
  assert.ok(Math.abs(bearingDegrees({ lat: A[1], lng: A[0] }, { lat: B[1], lng: B[0] }) - 0) < 0.5)
  assert.ok(Math.abs(bearingDegrees({ lat: B[1], lng: B[0] }, { lat: C[1], lng: C[0] }) - 90) < 0.5)
})

test('a fix on the route is placed on it, with the distance covered so far', () => {
  const located = locateOnRoute(ROUTE, { lat: 21.0250, lng: 105.8500 })
  assert.equal(located.segmentIndex, 0)
  assert.ok(located.offRouteMeters < 1)
  assert.ok(Math.abs(located.alongMeters - 556) < 5)
  assert.ok(Math.abs(located.totalMeters - 2151) < 10)
})

test('a fix beside the road is snapped to it and reported as off by that much', () => {
  // 0.0005° of longitude east of the first leg, about 52 m at this latitude.
  const located = locateOnRoute(ROUTE, { lat: 21.0250, lng: 105.8505 })
  assert.ok(Math.abs(located.offRouteMeters - 52) < 3)
  assert.ok(Math.abs(located.snapped[0] - 105.85) < 1e-9)
})

test('the right leg wins after the corner', () => {
  const located = locateOnRoute(ROUTE, { lat: 21.0300, lng: 105.8550 })
  assert.equal(located.segmentIndex, 1)
  assert.ok(Math.abs(located.totalMeters - located.alongMeters - 519) < 5)
})

test('the route splits into the part travelled and the part ahead, meeting at the traveller', () => {
  const located = locateOnRoute(ROUTE, { lat: 21.0300, lng: 105.8550 })
  const { passed, remaining } = splitRoute(ROUTE, located)
  assert.deepEqual(passed.slice(0, 2), [A, B])
  assert.deepEqual(passed.at(-1), remaining[0])
  assert.deepEqual(remaining.at(-1), C)
})

test('too short a route cannot be followed', () => {
  assert.equal(locateOnRoute([A], { lat: 21, lng: 105 }), null)
  assert.deepEqual(splitRoute(ROUTE, null), { passed: [], remaining: ROUTE })
})
