import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPublicItinerary } from '../src/lib/itineraries.js'

const id = '00000000-0000-4000-8000-000000000010'
test('shared trip frontend reads only the RPC and strips owner information', async () => {
  const calls = []
  const client = { rpc: async (...args) => { calls.push(args); return { data: { id, user_id: 'private-owner', days: [] } } }, from: () => assert.fail('No direct shared table read') }
  const trip = await getPublicItinerary(id, { client })
  assert.equal(trip.id, id)
  assert.equal('user_id' in trip, false)
  assert.deepEqual(calls, [['shared_itinerary', { p_id: id }]])
})

test('missing RPC, network failure, revoked link and malformed id never trigger table fallback', async () => {
  for (const result of [{ error: { code: 'PGRST202' } }, { error: { code: '42501' } }, { data: null }]) {
    const client = { rpc: async () => result, from: () => assert.fail('No fallback allowed') }
    assert.equal(await getPublicItinerary(id, { client }), null)
  }
  assert.equal(await getPublicItinerary(id, { client: { rpc: async () => { throw Error('offline') } } }), null)
  assert.equal(await getPublicItinerary('invalid', { client: { rpc: () => assert.fail('Do not query malformed ids') } }), null)
})
