import { test, expect } from '@playwright/test'
import { mockBackend } from '../fixtures/backend.js'

const iso = (ms) => new Date(ms).toISOString()
const DAY = 24 * 3600 * 1000
const base = { title_en: null, address: null, lat: null, lng: null, is_free: true, price_note: null, official_url: null, image_url: null, status: 'published', review_note: null, created_by: null, created_at: iso(Date.now()), reviewed_at: null, valid_from: null, valid_until: null, starts_at: null, ends_at: null, weekly_days: null, weekly_start: null, weekly_end: null }
// Fixture rows only: the real table starts empty and holds what partners and admins enter.
const events = [
  { ...base, id: '00000000-0000-4000-8000-0000000000e1', title_vi: 'Chợ đêm kiểm thử', summary: 'Chợ đêm dùng cho kiểm thử giao diện', city_id: 'hanoi', venue: 'Phố kiểm thử', weekly_days: [0, 1, 2, 3, 4, 5, 6], weekly_start: '00:00:00', weekly_end: '23:59:00' },
  { ...base, id: '00000000-0000-4000-8000-0000000000e2', title_vi: 'Lễ hội ẩm thực kiểm thử', summary: 'Lễ hội dùng cho kiểm thử giao diện', city_id: 'hanoi', venue: 'Công viên kiểm thử', is_free: false, price_note: 'Theo ban tổ chức', starts_at: iso(Date.now() + 5 * DAY), ends_at: iso(Date.now() + 6 * DAY) },
  { ...base, id: '00000000-0000-4000-8000-0000000000e3', title_vi: 'Sự kiện đã qua kiểm thử', summary: 'Sự kiện cũ dùng cho kiểm thử giao diện', city_id: 'hanoi', venue: 'Nơi cũ', starts_at: iso(Date.now() - 10 * DAY), ends_at: iso(Date.now() - 9 * DAY) },
]

test('trang sự kiện: đang diễn ra trước, ẩn sự kiện đã qua, mở chi tiết', async ({ page }) => {
  const mock = await mockBackend(page, { events })
  await page.goto('/su-kien', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1, name: 'Lễ hội, chợ đêm và phố ẩm thực' })).toBeVisible()
  const cards = page.locator('main article')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Chợ đêm kiểm thử')
  await expect(cards.first()).toContainText('Đang diễn ra')
  await expect(cards.nth(1)).toContainText('Sắp diễn ra')
  await expect(page.getByText('Sự kiện đã qua kiểm thử')).toHaveCount(0)
  await page.getByLabel('Hiện cả sự kiện đã qua').check()
  await expect(cards).toHaveCount(3)
  await page.getByRole('link', { name: 'Lễ hội ẩm thực kiểm thử' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Lễ hội ẩm thực kiểm thử' })).toBeVisible()
  await expect(page.getByText('Có thu phí — Theo ban tổ chức')).toBeVisible()
  await expect(page).toHaveTitle('Lễ hội ẩm thực kiểm thử — FoodTrip')
  expect(mock.writes).toEqual([])
  mock.assertNoErrors()
})

test('trang thành phố: số địa điểm đã lưu thật, sự kiện sắp tới, không tràn ngang', async ({ page }) => {
  const mock = await mockBackend(page, { events, cityCounts: [{ city: 'Hà Nội', places: 17 }] })
  await page.goto('/thanh-pho/hanoi', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1, name: 'Hà Nội' })).toBeVisible()
  await expect(page.getByText('17 địa điểm đã lưu trên FoodTrip')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sự kiện ẩm thực sắp tới' })).toBeVisible()
  await expect(page.locator('main article')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  mock.assertNoErrors()
})

test('thành phố khi chưa có hàm đếm: không hiện số giả', async ({ page }) => {
  const mock = await mockBackend(page)
  await page.goto('/thanh-pho/hue', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1, name: 'Huế' })).toBeVisible()
  await expect(page.getByText(/địa điểm đã lưu/)).toHaveCount(0)
  mock.assertNoErrors()
})

test('đối tác đề xuất sự kiện lặp hằng tuần', async ({ page }) => {
  const mock = await mockBackend(page, { role: 'owner' })
  await page.goto('/su-kien?city=hanoi', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Đề xuất sự kiện' }).click()
  await page.getByLabel('Tên sự kiện (tiếng Việt)').fill('Chợ đêm phố cổ')
  await page.getByLabel('Mô tả ngắn').fill('Chợ đêm cuối tuần quanh phố cổ')
  await page.getByLabel('Địa điểm', { exact: true }).fill('Phố Hàng Đào')
  await page.getByLabel('Lặp hằng tuần (chợ đêm, phố đi bộ)').check()
  await page.getByLabel('Mở cửa').fill('18:00')
  await page.getByLabel('Đóng cửa').fill('23:00')
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
  await expect(page.getByRole('alert')).toHaveText('Chọn ít nhất một ngày.')
  await page.getByText('T6', { exact: true }).click()
  await page.getByText('T7', { exact: true }).click()
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
  await expect(page.getByText('Đã gửi. Đề xuất đang chờ FoodTrip duyệt.')).toBeVisible()
  const [write] = mock.writes
  expect(write.path).toMatch(/food_events$/)
  expect(write.body).toMatchObject({ title_vi: 'Chợ đêm phố cổ', city_id: 'hanoi', weekly_days: [5, 6], weekly_start: '18:00', weekly_end: '23:00', starts_at: null })
  expect('status' in write.body).toBe(false)
  mock.assertNoErrors()
})

test('tài khoản thường không có nút đề xuất', async ({ page }) => {
  const mock = await mockBackend(page, { role: 'customer' })
  await page.goto('/su-kien', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Chỉ đối tác lưu trú hoặc tour đề xuất được sự kiện.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đề xuất sự kiện' })).toHaveCount(0)
  mock.assertNoErrors()
})
