import test from 'node:test'
import assert from 'node:assert/strict'
import { coordinates, postPayload, commentPayload, validatePhoto, olderThan, MAX_INPUT_BYTES } from '../src/lib/communityValidation.js'

const draft = { author_name: '  Minh  ', body: ' Một nơi đẹp. ', place_name: ' Đồi cát ', address: ' Bình Thuận ', lat: '10.95', lng: '108.29' }
test('community post trims input and requires a precise, valid location', () => {
  assert.deepEqual(postPayload(draft), { author_name: 'Minh', body: 'Một nơi đẹp.', place_name: 'Đồi cát', address: 'Bình Thuận', lat: 10.95, lng: 108.29 })
  for (const [lat, lng] of [['', ''], [null, null], [undefined, 1], [true, false], [[], []], [91, 106], [1, -181], ['NaN', 10], [Infinity, 10]]) assert.throws(() => coordinates(lat, lng), /invalid-location/)
  assert.deepEqual(coordinates(0, 0), { lat: 0, lng: 0 })
  assert.deepEqual(coordinates(-90, 180), { lat: -90, lng: 180 })
})
test('community text limits and public alias are enforced', () => {
  for (const patch of [{ author_name: ' ' }, { author_name: 'x'.repeat(61) }, { body: '' }, { body: 'x'.repeat(3001) }, { place_name: '' }, { address: 'x'.repeat(501) }]) assert.throws(() => postPayload({ ...draft, ...patch }), /invalid-content/)
  assert.deepEqual(commentPayload({ author_name: ' An ', body: ' Chào bạn! ' }), { author_name: 'An', body: 'Chào bạn!' })
  assert.throws(() => commentPayload({ author_name: 'An', body: 'x'.repeat(1001) }), /invalid-content/)
  // React renders content as text; do not silently strip user input or execute markup.
  assert.equal(commentPayload({ author_name: 'An', body: '<script>alert(1)</script>' }).body, '<script>alert(1)</script>')
})
test('only bounded raster image uploads are accepted', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.doesNotThrow(() => validatePhoto({ type, size: 1024 }))
  for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: 'text/html', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: MAX_INPUT_BYTES + 1 }]) assert.throws(() => validatePhoto(file), /invalid-photo/)
})
test('keyset pagination validates database cursors, including timezone offsets', () => {
  assert.equal(olderThan(null), null)
  const id = 'f105f00d-0000-4000-8000-000000000010'
  const created_at = '2026-09-21T10:00:00.000001+00:00'
  assert.equal(olderThan({ id, created_at }), `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`)
  assert.throws(() => olderThan({ id: 'x),id.gt.0', created_at }), /invalid-cursor/)
  assert.throws(() => olderThan({ id, created_at: 'today),id.gt.0' }), /invalid-cursor/)
})
