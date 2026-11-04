import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchPlaceFacts } from '../src/lib/placeFacts.js'

test('place facts read the public function, numbers as numbers', async () => {
  let asked = null
  const rpc = async (args) => { asked = args; return { data: { saved: '3', rating: '4.5', review_count: 2, items: [{ id: 'r1', rating: 5 }], mine: null }, error: null } }
  const facts = await fetchPlaceFacts('pho-thin-bo-ho', { rpc })
  assert.deepEqual(asked, { p_place: 'pho-thin-bo-ho', p_limit: 10 })
  assert.deepEqual(facts, { saved: 3, rating: 4.5, reviewCount: 2, items: [{ id: 'r1', rating: 5 }], mine: null })
})

test('no facts rather than false zeros when the function is missing or fails', async () => {
  assert.equal(await fetchPlaceFacts('x-place', { rpc: null }), null)
  assert.equal(await fetchPlaceFacts('x-place', { rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) }), null)
  assert.equal(await fetchPlaceFacts('x-place', { rpc: async () => { throw new Error('offline') } }), null)
  assert.equal(await fetchPlaceFacts('', { rpc: async () => ({ data: {}, error: null }) }), null)
})
