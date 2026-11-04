import { test, expect } from '@playwright/test'
import { mockBackend } from '../fixtures/backend.js'

// A curated sample place (src/data/destinations.js); the facts below are fixture values only.
const PLACE = '/place/pho-thin-bo-ho'
const facts = { saved: 3, rating: 4.5, review_count: 2, items: [
  { id: 'r1', rating: 5, comment: 'Nước dùng đậm, phục vụ nhanh', author: 'Mai T.', created_at: '2026-11-01T03:00:00Z', updated_at: '2026-11-01T03:00:00Z' },
  { id: 'r2', rating: 4, comment: null, author: '', created_at: '2026-10-20T03:00:00Z', updated_at: '2026-10-22T03:00:00Z' },
], mine: null }

test('trang quán: số người đã lưu, đánh giá FoodTrip tách khỏi Google, khách được mời đăng nhập', async ({ page }) => {
  const mock = await mockBackend(page, { placeFacts: facts })
  await page.goto(PLACE, { waitUntil: 'domcontentloaded' })
  const section = page.locator('section[aria-labelledby="ft-reviews-title"]')
  await expect(section.getByRole('heading', { name: 'Đánh giá của người dùng FoodTrip' })).toBeVisible()
  await expect(section.getByText('3 người đã lưu quán này')).toBeVisible()
  await expect(section.getByText('4,5/5 · 2 đánh giá')).toBeVisible()
  await expect(section.getByText('Người viết chưa được xác minh đã đến quán.')).toBeVisible()
  await expect(section.getByText('Mai T.')).toBeVisible()
  await expect(section.getByText('Người dùng FoodTrip', { exact: true })).toBeVisible()
  await section.getByRole('button', { name: 'Đăng nhập để đánh giá' }).click()
  await expect(page.locator('.ft-auth-dialog')).toBeVisible()
  expect(mock.writes).toEqual([])
  mock.assertNoErrors()
})

test('chưa có hàm trên server: không hiện mục đánh giá FoodTrip', async ({ page }) => {
  const mock = await mockBackend(page)
  await page.goto(PLACE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Đánh giá của người dùng FoodTrip' })).toHaveCount(0)
  mock.assertNoErrors()
})

test('người dùng đăng nhập chấm sao và gửi nhận xét', async ({ page }) => {
  const mock = await mockBackend(page, { role: 'customer', placeFacts: { ...facts, items: [], review_count: 0, rating: null } })
  await page.goto(PLACE, { waitUntil: 'domcontentloaded' })
  const section = page.locator('section[aria-labelledby="ft-reviews-title"]')
  await section.getByRole('button', { name: 'Viết đánh giá' }).click()
  await section.getByRole('button', { name: 'Gửi' }).click()
  await expect(section.getByRole('alert')).toHaveText('Chọn số sao.')
  await section.getByRole('button', { name: '4 sao' }).click()
  await section.getByLabel('Nhận xét (không bắt buộc)').fill('Ngon, hơi đông vào buổi sáng')
  await section.getByRole('button', { name: 'Gửi' }).click()
  await expect.poll(() => mock.writes.length).toBe(1)
  expect(mock.writes[0].path).toMatch(/submit_place_review$/)
  expect(mock.writes[0].body).toEqual({ p_place: 'pho-thin-bo-ho', p_rating: 4, p_comment: 'Ngon, hơi đông vào buổi sáng' })
  mock.assertNoErrors()
})
