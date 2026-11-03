import process from 'node:process'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { requireLocalSupabase } from '../../scripts/e2e-safety.mjs'

const url = requireLocalSupabase(process.env.VITE_SUPABASE_URL)
const password = 'Local-E2E-only-2026!'
async function customer(name = 'customer') {
  // Each call owns a separate Auth session and HTTP client; no shared login state.
  const client = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email: `${name}@e2e.example.test`, password })
  expect(error).toBeNull()
  return client
}
function dates(offset, project) {
  const day = new Date(); day.setUTCDate(day.getUTCDate() + offset + (project === '1280px' ? 10 : 0))
  const start = day.toISOString().slice(0, 10)
  day.setUTCDate(day.getUTCDate() + 1)
  return [start, day.toISOString().slice(0, 10)]
}
async function reserve(client, offset, project) {
  const [start, end] = dates(offset, project)
  return client.rpc('reserve_partner_room', { p_room: process.env.E2E_ROOM_ID, p_in: start, p_out: end, p_guests: 1, p_name: 'Local Guest', p_phone: '0900000000', p_email: 'customer@e2e.example.test', p_total: 100000, p_key: randomUUID() })
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const target = new URL(route.request().url()), origin = target.origin
    if (origin === url && target.pathname.startsWith('/functions/v1/')) return route.fulfill({ json: { status: 'no-key', places: [] } })
    return [url, 'http://127.0.0.1:4182'].includes(origin) ? route.continue() : route.abort('blockedbyclient')
  })
})
test('Auth local: đăng ký SDK, đăng nhập/đăng xuất trên UI và giữ trang /account', async ({ page }, info) => {
  const client = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const email = `signup-${randomUUID()}@e2e.example.test`
  const signup = await client.auth.signUp({ email, password })
  expect(signup.error).toBeNull()
  // Local config must allow email signup without a real outbound email provider.
  const login = await client.auth.signInWithPassword({ email, password })
  expect(login.error).toBeNull()
  expect(login.data.user.email).toBe(email)
  expect((await client.auth.signOut()).error).toBeNull()
  expect((await client.auth.getSession()).data.session).toBeNull()
  await page.goto('/account', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Đăng nhập / Đăng ký', exact: true }).click()
  const dialog = page.locator('.ft-auth-dialog')
  await dialog.locator('#auth-email').fill(email)
  await dialog.locator('#auth-password').fill(password)
  await dialog.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible()
  await expect(page).toHaveURL(/\/account$/)
  if (info.project.name === '375px') {
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click()
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Tài khoản', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'Đăng nhập để sử dụng chức năng này', exact: true })).toBeVisible()
})
test('SePay local mock: đủ tiền, gửi trùng và thiếu rồi bù đều giữ DEMO', async ({ page }, info) => {
  const client = await customer()
  const admin = await customer('admin')
  const before = await admin.rpc('admin_overview')
  expect(before.error).toBeNull()
  for (const [offset, scenarios] of [[2, ['exact']], [4, ['underpaid', 'remaining']]]) {
    const booking = await reserve(client, offset, info.project.name)
    expect(booking.error).toBeNull()
    for (const scenario of scenarios) {
      const args = { p_booking: booking.data.id, p_key: randomUUID(), p_scenario: scenario }
      const transfer = await client.rpc('mock_sepay_transfer', args)
      expect(transfer.error).toBeNull()
      expect(transfer.data.mock).toBe(true)
      const duplicate = await client.rpc('mock_sepay_transfer', args)
      expect(duplicate.error).toBeNull()
      expect(duplicate.data.duplicate).toBe(true)
      const state = await client.from('bookings').select('*').eq('id', booking.data.id).single()
      expect(state.error).toBeNull()
      expect(state.data.payment_status).toBe(scenario === 'underpaid' ? 'pending' : 'paid')
      if (scenario !== 'underpaid') expect(state.data.payment_txn_ref).toBe('DEMO')
    }
  }
  const after = await admin.rpc('admin_overview')
  expect(after.error).toBeNull()
  expect(after.data.revenue_paid).toBe(before.data.revenue_paid)
  // Browser is deliberately kept local; bank QR/webhook services are not opened.
  await page.goto('/bookings', { waitUntil: 'domcontentloaded' })
})
test('hai session tranh phòng cuối: đúng một đơn được tạo', async ({ page }, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const [a, b] = await Promise.all([customer(), customer('customer-two')])
  const results = await Promise.all([reserve(a, 6, info.project.name), reserve(b, 6, info.project.name)])
  expect(results.filter((r) => r.error === null)).toHaveLength(1)
  expect(results.filter((r) => r.error !== null)).toHaveLength(1)
  expect(results.find((r) => r.error)?.error.message).toMatch(/sold|unavailable|inventory|room/i)
})
test('giữ chỗ tour và đọc lại đơn của chính mình', async () => {
  const client = await customer()
  const booking = await client.rpc('tour_reserve', { p_departure: process.env.E2E_DEPARTURE_ID, p_seats: 1, p_name: 'Local Guest', p_phone: '0900000000', p_key: randomUUID(), p_expected_price: 200000 })
  expect(booking.error).toBeNull()
  const own = await client.from('tour_reservations').select('*').eq('id', booking.data).single()
  expect(own.error).toBeNull()
  expect(own.data.status).toBe('requested')
  expect(own.data.departure_id).toBe(process.env.E2E_DEPARTURE_ID)
  expect((await client.rpc('tour_set_reservation', { p_booking: booking.data, p_status: 'cancelled', p_note: 'Local test cleanup' })).error).toBeNull()
})
