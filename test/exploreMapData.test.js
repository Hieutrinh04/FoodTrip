import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLUSTER_SOURCE, toFeatureCollection } from '../src/lib/exploreMapData.js'

const place = (id, over = {}) => ({ id, name: { vi: `Quán ${id}`, en: `Place ${id}` }, ...over })

test('each located place is one point carrying the figure its card shows', () => {
  const fc = toFeatureCollection([
    { place: place('a', { displayScore: 8.24 }), location: { lat: 21.03, lng: 105.85 } },
    { place: place('b', { displayScore: null }), location: { lat: 21.04, lng: 105.86 } },
  ], 'overall', 'en')
  assert.equal(fc.features.length, 2)
  assert.deepEqual(fc.features[0].geometry.coordinates, [105.85, 21.03])
  assert.deepEqual(fc.features[0].properties, { id: 'a', name: 'Place a', badge: '8.2', hasBadge: 1 })
  assert.equal(fc.features[1].properties.hasBadge, 0)
})

test('clusters split apart before the zoom a selected place is shown at', () => {
  assert.equal(CLUSTER_SOURCE.cluster, true)
  // ExploreMap eases a selection to zoom ≥ 14; above clusterMaxZoom every point is single.
  assert.ok(CLUSTER_SOURCE.clusterMaxZoom < 14)
})
