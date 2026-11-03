import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exploreParams } from '../src/lib/exploreUrl.js'

test('an Explore view becomes a short, shareable query string', () => {
  assert.equal(exploreParams({}).toString(), '')
  assert.equal(exploreParams({ city: 'all', q: '  ', category: 'all', food: 'all', place: null }).toString(), '')
  const p = exploreParams({ city: 'hanoi', q: ' phở bò ', category: 'food', food: 'noodle', place: 'gmaps-abc' })
  assert.equal(p.get('city'), 'hanoi')
  assert.equal(p.get('q'), 'phở bò')
  assert.equal(p.get('category'), 'food')
  assert.equal(p.get('food'), 'noodle')
  assert.equal(p.get('place'), 'gmaps-abc')
  // Round trip: what is written reads back the same.
  assert.equal(new URLSearchParams(p.toString()).get('q'), 'phở bò')
})
