import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountWorkspaces, currentWorkspace } from '../src/lib/workspaces.js'

const access = {
  userId: 'u', status: 'ready', admin: true,
  properties: [{ id: 'stay-a', name: 'Nhà A', role: 'owner', active: true }, { id: 'stay-b', name: 'Nhà B', role: 'staff', active: false }],
  operators: [{ id: 'tour-a', name: 'Tour A', role: 'owner', status: 'approved' }, { id: 'tour-b', name: 'Tour B', role: 'manager', status: 'approved' }, { id: 'tour-c', name: 'Tour C', role: 'guide', status: 'approved' }, { id: 'pending', name: 'Pending', role: 'owner', status: 'pending' }],
}

test('workspace entry points cover every verified role with its own scope', () => {
  const entries = accountWorkspaces(access)
  assert.deepEqual(entries.map((e) => e.role), ['member', 'admin', 'hotel_owner', 'hotel_staff', 'tour_owner', 'tour_manager', 'guide'])
  assert.equal(entries.find((e) => e.role === 'hotel_staff').suspended, true)
  assert.equal(entries.find((e) => e.role === 'tour_manager').to, '/partner/tours?operator=tour-b')
  assert.equal(entries.find((e) => e.role === 'guide').to, '/partner/tours?view=guide')
  assert.ok(!entries.some((e) => e.scopeId === 'pending' || e.scopeId === 'tour-c'))
})

test('unverified grants and signed-out accounts never show privileged workspaces', () => {
  assert.deepEqual(accountWorkspaces({ ...access, userId: null }), [])
  for (const status of ['loading', 'error']) assert.deepEqual(accountWorkspaces({ ...access, status }).map((e) => e.id), ['personal'])
  assert.deepEqual(accountWorkspaces({ userId: 'member', status: 'ready' }).map((e) => e.id), ['personal'])
})

test('workspace selection keeps mixed guide/manager accounts on the intended view', () => {
  const entries = accountWorkspaces(access)
  assert.equal(currentWorkspace(entries, '/partner', '?property=stay-b&tab=bookings').role, 'hotel_staff')
  assert.equal(currentWorkspace(entries, '/partner/tours', '?operator=tour-b&tab=departures').role, 'tour_manager')
  assert.equal(currentWorkspace(entries, '/partner/tours', '?view=guide').role, 'guide')
  assert.equal(currentWorkspace(entries, '/partner/tours', '?operator=another-account').scopeId, 'tour-a')
  assert.equal(currentWorkspace(entries, '/admin').role, 'admin')
  assert.equal(currentWorkspace(entries, '/bookings').id, 'personal')
  assert.equal(currentWorkspace(entries, '/partner', '?view=application').id, 'personal')
  assert.equal(currentWorkspace(entries, '/partner', '?claim=external-place').id, 'personal')
  assert.equal(currentWorkspace(accountWorkspaces({ userId: 'member', status: 'ready' }), '/admin').id, 'personal')
})

test('scope identifiers are encoded in workspace links', () => {
  const entries = accountWorkspaces({ userId: 'u', status: 'ready', properties: [{ id: 'a&tab=team', name: 'A', role: 'staff', active: true }] })
  const query = new URL(entries[1].to, 'https://foodtrip.test').searchParams
  assert.equal(query.get('property'), 'a&tab=team')
  assert.equal(query.has('tab'), false)
})
