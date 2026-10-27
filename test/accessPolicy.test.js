import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountRoles, canAccess, FEATURES } from '../src/lib/accessPolicy.js'

const member = { userId: 'alice', status: 'ready', admin: false, properties: [], operators: [] }

test('guest can browse but cannot open personal or privileged pages', () => {
  const guest = { ...member, userId: null }
  assert.deepEqual(accountRoles(guest), ['guest'])
  assert.equal(canAccess(guest, 'public'), true)
  for (const capability of ['account', 'admin', 'hotel.portal', 'tour.portal']) assert.equal(canAccess(guest, capability), false)
  assert.equal(FEATURES.find((f) => f.id === 'saved').grants.guest, undefined)
  assert.equal(FEATURES.find((f) => f.id === 'liveJoin').grants.guest, undefined)
  assert.equal(FEATURES.find((f) => f.id === 'feed').grants.guest, 'preview')
  for (const id of ['plan', 'export', 'book', 'post', 'review', 'trip', 'liveCreate', 'notifications']) {
    assert.equal(FEATURES.find((f) => f.id === id).grants.guest, undefined, `${id} requires an account`)
    assert.ok(FEATURES.find((f) => f.id === id).grants.member, `${id} remains available to members`)
  }
})

test('property owner at A and staff at B cannot use owner permissions at B', () => {
  const access = { ...member, properties: [{ id: 'a', role: 'owner', active: true }, { id: 'b', role: 'staff', active: true }] }
  assert.equal(canAccess(access, 'hotel.inventory', { propertyId: 'a' }), true)
  assert.equal(canAccess(access, 'hotel.inventory', { propertyId: 'b' }), false)
  assert.equal(canAccess(access, 'hotel.fulfillment', { propertyId: 'b' }), true)
  assert.equal(canAccess(access, 'hotel.fulfillment', { propertyId: 'other' }), false)
  assert.equal(canAccess(access, 'tour.manage'), false)
  assert.equal(canAccess({ ...access, properties: [{ id: 'a', role: 'owner', active: false }] }, 'hotel.inventory'), false)
})

test('pending operator owner cannot operate; guide and manager roles remain scoped', () => {
  const access = { ...member, operators: [
    { id: 'a', role: 'owner', status: 'pending' },
    { id: 'b', role: 'guide', status: 'approved' },
    { id: 'c', role: 'manager', status: 'approved' },
  ] }
  assert.deepEqual(accountRoles(access), ['member', 'guide', 'tour_manager'])
  assert.equal(canAccess(access, 'tour.manage', { operatorId: 'a' }), false)
  assert.equal(canAccess(access, 'tour.manage', { operatorId: 'b' }), false)
  assert.equal(canAccess(access, 'tour.manifest', { operatorId: 'b' }), true)
  assert.equal(canAccess(access, 'tour.manage', { operatorId: 'c' }), true)
  assert.equal(canAccess(access, 'tour.team', { operatorId: 'c' }), false)
  assert.equal(canAccess(access, 'tour.manifest', { operatorId: 'c' }), false)
})

test('admin is not implicitly a partner owner; missing, stale or failed grants are denied', () => {
  const access = { ...member, admin: true, properties: [{ id: 'a', role: 'owner', active: true }] }
  assert.equal(canAccess({ ...member, admin: true }, 'hotel.inventory'), false)
  assert.equal(canAccess({ ...member, admin: true }, 'tour.team'), false)
  assert.equal(canAccess(access, 'admin'), true)
  for (const status of ['loading', 'error']) {
    assert.equal(canAccess({ ...access, status }, 'hotel.portal'), false)
    assert.equal(canAccess({ ...access, status }, 'admin'), false)
    assert.deepEqual(accountRoles({ ...access, status }), ['member'])
  }
  assert.equal(canAccess({ ...access, userId: null }, 'admin'), false)
  assert.equal(canAccess(access, 'invented.permission'), false)
  assert.equal(canAccess({ ...member, user_metadata: { role: 'admin' } }, 'admin'), false)
})
