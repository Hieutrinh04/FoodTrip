import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foodPreferencePatch, mergeFoodPreferences } from '../src/lib/assistantFoodPreferences.js'
import { placeFollowUp } from '../src/lib/assistantPlaceContext.js'
import { findFoodAnswer, tripInContext } from '../src/lib/assistantAnswers.js'
import { planTurn } from '../src/lib/assistantConversation.js'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'

const trip = planTurn('Đà Lạt 2 ngày 2 người', [], null, null).trip
const venue = (id, name, rating, count, category = 'food', city = 'dalat') => ({ id, city, category, name: { vi: name }, address: { vi: city === 'dalat' ? 'Đà Lạt' : 'Hà Nội' }, shortDesc: { vi: '' }, googleRating: rating, googleRatingCount: count })
const venues = [venue('meat', 'Phở thịt bò', 4.9, 500), venue('veg-a', 'Nhà hàng chay A', 4.7, 150), venue('veg-b', 'Quán chay B', 4.5, 30), venue('cafe', 'Cà phê C', 4.8, 400, 'cafe'), venue('low', 'Quán chay D', 4.1, 1000)]
const deps = { catalog: async () => venues, locate: async () => ({}), search: async () => ({ places: venues }) }
const source = { message: 'tìm quán phở ở Đà Lạt', slots: [], trip }
const history = [{ from: 'bot', intent: 'find_food', foodSearch: source, places: venues.slice(0, 3) }]

test('dining requirements read decimal ratings, counts and meal budgets without changing omitted filters', () => {
  const patch = foodPreferencePatch('Mình ăn chay, từ 4,5 sao, ít nhất 100 lượt đánh giá, tối đa 100k mỗi người, đang mở cửa')
  assert.deepEqual(patch, { kind: 'vegetarian', minRating: 4.5, ratingExclusive: false, minReviews: 100, mealBudget: 100000, openNow: true })
  assert.equal(foodPreferencePatch('above 4.5 stars').ratingExclusive, true)
  assert.equal(foodPreferencePatch('quán trên 4 sao').ratingExclusive, true)
  assert.equal(foodPreferencePatch('tối đa 100000đ').mealBudget, 100000)
  assert.equal(foodPreferencePatch('từ 9 sao').minRating, undefined)
  assert.equal(mergeFoodPreferences('bỏ lọc sao', patch).minRating, null)
  assert.equal(mergeFoodPreferences('bỏ lọc sao', patch).minReviews, 100)
  assert.deepEqual(foodPreferencePatch('thời tiết như thế nào?'), {})
})

test('refining dining preferences retains the destination and replaces the previous dish when changing category', () => {
  const follow = placeFollowUp('mình ăn chay', history)
  assert.equal(follow.type, 'refine')
  assert.equal(follow.search.trip.cityId, 'dalat')
  assert.equal(follow.search.message, 'tìm quán chay')
  const filteredHistory = [...history, { from: 'bot', intent: 'find_food', foodSearch: follow.search }]
  const next = placeFollowUp('chỉ lấy từ 4,5 sao', filteredHistory)
  assert.equal(next.search.preferences.kind, 'vegetarian')
  assert.equal(next.search.preferences.minRating, 4.5)
  const changed = placeFollowUp('đổi sang cà phê', [{ from: 'bot', intent: 'find_food', foodSearch: next.search }])
  assert.equal(changed.search.preferences.kind, 'cafe')
  assert.equal(changed.search.preferences.minRating, 4.5)
  assert.equal(changed.search.message, 'tìm quán cà phê')
})

test('explicit city corrections retain dining filters; new topics and planner requests escape dining context', () => {
  const preferences = { kind: 'vegetarian', minRating: 4.5 }
  const prior = [{ from: 'bot', intent: 'find_food', foodSearch: { ...source, preferences } }]
  const next = placeFollowUp('ở Hà Nội thì sao?', prior)
  assert.equal(next.type, 'refine')
  assert.equal(next.search.trip.cityId, 'hanoi')
  assert.deepEqual(next.search.preferences, preferences)
  assert.equal(placeFollowUp('thời tiết Hà Nội', prior), null)
  assert.equal(placeFollowUp('lên lịch trình ăn chay 3 ngày', prior), null)
  assert.equal(placeFollowUp('còn quán khác không', [...prior, { from: 'bot', intent: 'booking_cancel_refund' }]), null)
  assert.equal(placeFollowUp('mình ăn chay', []), null)
  assert.equal(placeFollowUp('đặt tour cà phê', prior), null)
})

test('food suggestions enforce stars, review counts, categories and city against both catalogue and provider results', async () => {
  const out = await findFoodAnswer('tìm quán chay ở Đà Lạt từ 4,5 sao, ít nhất 100 lượt đánh giá', [], trip, 'vi', deps)
  assert.deepEqual(out.places.map((p) => p.id), ['veg-a'])
  assert.match(out.text, /Tiêu chí đã áp dụng/)
  assert.match(out.text, /xác nhận thành phần/)
  const cafe = await findFoodAnswer('tìm quán cà phê ở Đà Lạt', [], trip, 'vi', deps)
  assert.deepEqual(cafe.places.map((p) => p.id), ['cafe'])
  const exclusive = await findFoodAnswer('tìm quán ăn ở Đà Lạt trên 4,7 sao', [], trip, 'vi', deps)
  assert.ok(exclusive.places.every((p) => p.googleRating > 4.7))
})

test('new filters override text from the original search and can explicitly be cleared', async () => {
  const strict = await findFoodAnswer('tìm quán chay từ 4 sao', [], trip, 'vi', { ...deps, preferences: { kind: 'vegetarian', minRating: 4.6 } })
  assert.deepEqual(strict.places.map((p) => p.id), ['veg-a'])
  const cleared = await findFoodAnswer('tìm quán chay từ 4,9 sao', [], trip, 'vi', { ...deps, preferences: { minRating: null } })
  assert.equal(cleared.places.length, 3)
})

test('missing price/opening evidence is disclosed; strict filters are never silently relaxed', async () => {
  const result = await findFoodAnswer('tìm quán ăn ở Đà Lạt dưới 100k, đang mở cửa', [], trip, 'vi', deps)
  assert.match(result.text, /chưa có giá thực đơn đã xác minh/)
  assert.match(result.text, /chưa xác minh trạng thái mở cửa/)
  const empty = await findFoodAnswer('tìm quán chay ở Đà Lạt từ 4,9 sao', [], trip, 'vi', deps)
  assert.equal(empty.places, undefined)
  assert.equal(empty.preferences.minRating, 4.9)
  assert.match(empty.text, /giữ nguyên các tiêu chí/)
  const emptyHistory = [...history, { from: 'bot', intent: 'find_food', foodSearch: { ...source, preferences: empty.preferences }, places: null }]
  assert.equal(placeFollowUp('đánh giá quán thứ nhất', emptyHistory).type, 'clarify', 'never select a venue from the list before an empty filtered search')
})

test('a food request without a destination asks for the city rather than assuming Ho Chi Minh City', async () => {
  const unknown = tripInContext('tìm quán chay', [])
  assert.equal(unknown.cityId, null)
  const out = await findFoodAnswer('tìm quán chay', [], unknown, 'vi', { catalog: async () => { throw new Error('must not fetch') } })
  assert.equal(out.need, 'dest')
  assert.equal(out.preferences.kind, 'vegetarian')
  assert.equal(ruleIntent('quán chay ở Đà Lạt').intent, 'find_food')
  assert.equal(ruleIntent('cà phê ở Hà Nội').intent, 'find_food')
})
