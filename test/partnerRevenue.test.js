import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthRevenue } from '../src/lib/partner.js'

const b = (over) => ({ payment_status: 'paid', payment_txn_ref: 'FT123', fulfillment_status: 'confirmed', check_in: '2026-11-12', total_price: 1000000, refund_amount: 0, ...over })

test('owner revenue counts real money the hotel keeps, not demo payments', () => {
  const bookings = [
    b({}),
    b({ payment_txn_ref: 'DEMO', total_price: 9000000 }),
    b({ payment_status: 'pending' }),
    b({ fulfillment_status: 'rejected' }),
    b({ fulfillment_status: 'no_show' }),
    b({ fulfillment_status: 'guest_cancelled', total_price: 2000000, refund_amount: 1000000 }),
    b({ check_in: '2026-10-30' }),
    b({ payment_txn_ref: null, total_price: 500000 }),
  ]
  assert.equal(monthRevenue(bookings, '2026-11'), 1000000 + 1000000 + 500000)
  assert.equal(monthRevenue([], '2026-11'), 0)
  assert.equal(monthRevenue(null, '2026-11'), 0)
})
