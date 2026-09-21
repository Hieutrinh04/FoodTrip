import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLiveRoomToken,
  flattenPresenceState,
  normalizeLiveRoomToken,
} from '../src/lib/liveTripRoom.js'

test('live room tokens are high-entropy URL-safe values and malformed tokens are rejected', () => {
  const first = createLiveRoomToken()
  const second = createLiveRoomToken()
  assert.match(first, /^[a-zA-Z0-9_-]{32,160}$/)
  assert.notEqual(first, second)
  assert.equal(normalizeLiveRoomToken(first), first)
  assert.equal(normalizeLiveRoomToken('short'), null)
  assert.equal(normalizeLiveRoomToken(`${first}?injected=true`), null)
})

test('presence state keeps the newest safe location for each member', () => {
  const members = flattenPresenceState({
    alice: [
      { id: 'alice', name: ' Alice ', color: '#2f5d4e', sharing: true, location: { lat: 10, lng: 106 }, updatedAt: 100 },
      { id: 'alice', name: 'Alice', color: '#2f5d4e', sharing: true, location: { lat: 11, lng: 107, accuracy: 8 }, updatedAt: 200 },
    ],
    invalid: [{ id: 'invalid', sharing: true, location: { lat: 999, lng: 107 }, updatedAt: 300 }],
  })

  assert.equal(members.length, 2)
  const alice = members.find((member) => member.id === 'alice')
  assert.deepEqual(alice.location, { lat: 11, lng: 107, accuracy: 8, heading: null, speed: null })
  assert.equal(alice.sharing, true)
  assert.equal(members.find((member) => member.id === 'invalid').sharing, false)
})
