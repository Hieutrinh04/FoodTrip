import test from 'node:test'
import assert from 'node:assert/strict'

import { nightlyRoomBudget, groupHotelsByBudgetTier } from '../src/lib/hotelBudget.js'

const priced = (id, priceFrom) => ({ id, priceSource: 'hotelbeds', priceFrom, rooms: [] })

test('the room budget is a share of the whole party\'s budget, spread over the nights', () => {
  // 1.5M a head, two people, 2 days = 1 night: 35% of 3M.
  assert.equal(nightlyRoomBudget({ budgetPerPerson: 1_500_000, people: 2, duration: 2 }), 1_050_000)
  // Three days is two nights.
  assert.equal(nightlyRoomBudget({ budgetPerPerson: 3_000_000, people: 2, duration: 3 }), 1_050_000)
  // A day trip still gets a night's figure rather than dividing by zero.
  assert.equal(nightlyRoomBudget({ budgetPerPerson: 1_000_000, people: 1, duration: 1 }), 350_000)
})

test('1M+ rooms are over the budget of a 1.5M-a-head weekend for two', () => {
  const groups = groupHotelsByBudgetTier(
    [priced('a', 1_488_000), priced('b', 1_069_000), priced('c', 638_000), priced('d', 387_000)],
    nightlyRoomBudget({ budgetPerPerson: 1_500_000, people: 2, duration: 2 }),
  )
  assert.deepEqual(groups.premium.map((h) => h.id), ['a', 'b'])
  assert.deepEqual(groups.match.map((h) => h.id), ['c'])
  assert.deepEqual(groups.value.map((h) => h.id), ['d'])
})
