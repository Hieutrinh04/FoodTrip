import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'
import { composeReply } from '../supabase/functions/_shared/assistant/reply.js'
import { ALL_SUGGESTIONS, suggestionsFor } from '../src/lib/assistantSuggestions.js'
import { answersPending, askedDish, findFoodAnswer } from '../src/lib/assistantAnswers.js'
import { bookingState, describeAccount, relevantBookings, HOLD_MS } from '../src/lib/assistantAccount.js'
import { askAssistant, transcriptOf } from '../src/lib/assistant.js'
import { resolveChatTurn } from '../src/lib/assistantConversation.js'

// 2026-11-10 10:00 in Vietnam.
const NOW = Date.parse('2026-11-10T03:00:00Z')

test('dish-led searches reach food computation in rules, offline fallback and a browser using an older server', async () => {
  for (const [message, dish] of [['bún chả ở Hà Nội', 'bún chả'], ['hải sản ở Đà Nẵng', 'hải sản'], ['phở Hà Nội', 'phở'], ['phở bò Hà Nội', 'phở bò'], ['bánh căn ở Đà Lạt', 'bánh căn'], ['bun cha o Ha Noi', 'bun cha']]) {
    assert.equal(askedDish(message, []), dish, message)
    assert.equal(ruleIntent(message).intent, 'find_food', message)
    const offline = await askAssistant(message)
    assert.equal(offline.intent, 'find_food', message)
    assert.equal(offline.action, null)
    const turn = resolveChatTurn(message, { intent: 'out_of_scope', faq: 'stale-faq', slots: [] })
    assert.equal(turn.answer.intent, 'find_food')
    assert.equal(turn.answer.faq, null)
    assert.equal(turn.updatePlan, false)
  }
})

test('locations and non-food questions never become dish-led discovery', () => {
  for (const [message, intent] of [['ở Hà Nội thì sao', 'out_of_scope'], ['thời tiết Hà Nội', 'ask_weather'], ['lên lịch 2 ngày ở Hội An', 'plan_trip'], ['huỷ phòng ở Đà Nẵng', 'booking_cancel_refund'], ['huỷ phòng có được hoàn tiền không?', 'booking_cancel_refund'], ['thời tiết phở Hà Nội', 'ask_weather'], ['phở Hà Nội mấy giờ mở cửa', 'place_info'], ['Hải Phòng', 'out_of_scope'], ['Hội An', 'out_of_scope'], ['phố Hà Nội', 'out_of_scope']]) {
    assert.equal(askedDish(message, []), null, message)
    assert.equal(ruleIntent(message).intent, intent, message)
  }
})

test('bare dish requests filter unrelated DB and live venues without relaxing the dish', async () => {
  const venue = (id, name, city, extra = {}) => ({ id, name: { vi: name }, address: { vi: city }, city, category: 'food', googleRating: 4.8, googleRatingCount: 500, ...extra })
  for (const [message, city, good, menu, emptyDish] of [
    ['bún chả ở Hà Nội', 'hanoi', 'Bún chả Hương Liên', 'Bún chả nướng', 'bún chả'],
    ['hải sản ở Đà Nẵng', 'danang', 'Hải sản Bé Mặn', 'Hải sản tươi', 'hải sản'],
    ['phở Hà Nội', 'hanoi', 'Phở Bát Đàn', 'Phở bò', 'phở'],
  ]) {
    const wrong = venue('wrong', 'Bún Thang Thanh Thanh gia truyền', city)
    const lobster = venue('lobster', 'Lobster Queen', city)
    const matching = venue('match', good, city)
    const withMenu = venue('menu', 'Bếp nhà', city, { menu: [menu] })
    for (const db of [true, false]) {
      const candidates = [wrong, lobster, matching, withMenu]
      const options = { catalog: async () => db ? candidates : [], locate: async () => ({}), search: async () => ({ places: db ? [] : candidates }) }
      const result = await findFoodAnswer(message, [], { cityId: city }, 'vi', options)
      assert.deepEqual(result.places.map((p) => p.id), ['match', 'menu'], `${message}, DB=${db}`)
      const empty = await findFoodAnswer(message, [], { cityId: city }, 'vi', { ...options, catalog: async () => [], search: async () => ({ places: [wrong, lobster] }) })
      assert.equal(empty.places, undefined)
      assert.ok(empty.text.includes(`chưa tìm thấy quán ${emptyDish}`))
    }
  }
})
const booking = (over) => ({
  id: over.id ?? 'b1', hotel_name: 'Dalat Pine', check_in: '2026-11-20', check_out: '2026-11-22', total_price: 1200000,
  payment_status: 'paid', fulfillment_status: 'awaiting', refund_status: 'none', refund_amount: 0, created_at: '2026-11-01T00:00:00Z', ...over,
})

test('every suggested question is read as what it asks, by the rules alone', () => {
  const expected = {
    'Đơn đặt phòng của tôi thế nào rồi?': 'booking_status', 'Huỷ phòng bây giờ được hoàn bao nhiêu?': 'booking_cancel_refund',
    'Mình cần thanh toán đơn nào?': 'booking_payment', 'Tour của tôi đã được xác nhận chưa?': 'tour_info', 'Đặt tour thanh toán thế nào?': 'tour_info',
    'Quán phở ngon ở Hà Nội': 'find_food', 'Ăn gì ở Đà Lạt?': 'find_food', 'Phở Thìn Lò Đúc mấy giờ mở cửa?': 'place_info',
    'Đổi quán trong lịch trình thế nào?': 'modify_plan', 'Đối tác cần chuẩn bị giấy tờ gì?': 'partner',
  }
  const all = new Set([...ALL_SUGGESTIONS.pages.flatMap((p) => p.vi), ...ALL_SUGGESTIONS.home.vi])
  for (const s of all) {
    const reply = composeReply(s, ruleIntent(s), 'vi')
    assert.notEqual(reply.intent, 'out_of_scope', s)
    if (expected[s]) assert.equal(reply.intent, expected[s], s)
  }
  assert.ok(suggestionsFor('/bookings', 'vi').includes('Đơn đặt phòng của tôi thế nào rồi?'))
  assert.deepEqual(suggestionsFor('/nowhere', 'en'), ALL_SUGGESTIONS.home.en)
  for (const p of ALL_SUGGESTIONS.pages) assert.equal(p.vi.length, p.en.length)
})

test('the dish a find-food message asks for', () => {
  assert.equal(askedDish('quán phở ngon ở Hà Nội'), 'phở')
  assert.equal(askedDish('tìm quán bún chả ở Hà Nội'), 'bún chả')
  assert.equal(askedDish('Ăn bánh căn ở đâu ngon Đà Lạt'), 'bánh căn')
  assert.equal(askedDish('phở ngon ở hà nội'), 'phở')
  assert.equal(askedDish('Ăn gì ở Đà Lạt?'), null)
  assert.equal(askedDish('quán nào ngon'), null)
  assert.equal(askedDish('ăn gì đây', [{ type: 'FOOD', text: 'bánh mì' }]), 'bánh mì')
})

test('find food: real rated places, best trusted first; asks the city when none is known', async () => {
  const p = (name, rating, count) => ({ id: name, name: { vi: name }, address: { vi: '' }, googleRating: rating, googleRatingCount: count })
  let asked = null
  const search = async (args) => { asked = args; return { places: [p('Ít review', 5, 2), p('Phở Thìn', 4.4, 3000), p('Không sao', null, 0), p('Phở Bát Đàn', 4.6, 900)] } }
  const locate = async () => ({ lat: 21.03, lng: 105.85 })
  const out = await findFoodAnswer('quán phở ngon ở Hà Nội', [], { cityId: null, destinationQuery: 'Hà Nội' }, 'vi', { search, locate })
  assert.equal(asked.keyword, 'phở')
  assert.equal(asked.pages, 1)
  assert.deepEqual(asked.origin, { lat: 21.03, lng: 105.85 })
  assert.deepEqual(out.places.map((x) => x.id), ['Phở Bát Đàn', 'Phở Thìn'])
  const none = await findFoodAnswer('quán phở ngon', [], { cityId: null, destinationQuery: null }, 'vi', { search, locate })
  assert.equal(none.need, 'dest')
  const nowhere = await findFoodAnswer('quán phở ngon', [], { cityId: null, destinationQuery: 'Xyz' }, 'vi', { search, locate: async () => null })
  assert.match(nowhere.text, /chưa xác định được vị trí/)
})

test('a reply to "Bạn đi đâu?" continues the question; a new question does not', () => {
  const unsure = { intent: 'out_of_scope', slots: [] }
  assert.equal(answersPending({ need: 'dest' }, 'Đà Lạt', unsure), true)
  assert.equal(answersPending({ need: 'dest' }, 'ở Sài Gòn nhé', unsure), true)
  assert.equal(answersPending({ need: 'dest' }, 'chi phí bao nhiêu', unsure), false)
  assert.equal(answersPending({ need: 'dest' }, 'huỷ phòng có hoàn tiền không', { intent: 'booking_cancel_refund', faq: 'refund-policy', slots: [] }), false)
  assert.equal(answersPending({ need: 'dest' }, 'cảm ơn', { intent: 'thanks', slots: [] }), false)
  assert.equal(answersPending({ need: 'place' }, 'Phở Thìn Lò Đúc', unsure), true)
  assert.equal(answersPending(null, 'Đà Lạt', unsure), false)
})

test('where a booking stands, as the guest reads it', () => {
  const held = booking({ payment_status: 'pending', created_at: new Date(NOW - 12 * 60000).toISOString() })
  assert.match(bookingState(held, 'vi', NOW), /còn giữ phòng 18 phút/)
  assert.match(bookingState({ ...held, created_at: new Date(NOW - HOLD_MS - 1).toISOString() }, 'vi', NOW), /hết 30 phút/)
  assert.equal(bookingState(booking({ fulfillment_status: 'confirmed' }), 'vi', NOW), 'khách sạn đã xác nhận')
  assert.match(bookingState(booking({ fulfillment_status: 'rejected', refund_status: 'pending', refund_amount: 1200000 }), 'vi', NOW), /từ chối — FoodTrip đang hoàn 1\.200\.000đ/)
  assert.match(bookingState(booking({ payment_status: 'cancelled', refund_status: 'completed', refund_amount: 600000 }), 'en', NOW), /cancelled — 600\.000đ refunded/)
})

test('the bookings worth talking about, and the answer for each intent', () => {
  const pending = booking({ id: 'p', payment_status: 'pending', created_at: new Date(NOW - 5 * 60000).toISOString(), check_in: '2026-12-01', check_out: '2026-12-02' })
  const past = booking({ id: 'old', check_in: '2026-10-01', check_out: '2026-10-03', fulfillment_status: 'completed' })
  const gone = booking({ id: 'gone', payment_status: 'cancelled' })
  const paid = booking({ id: 'paid' })
  assert.deepEqual(relevantBookings([past, paid, gone, pending], NOW).map((b) => b.id), ['p', 'paid'])

  const pay = describeAccount('booking_payment', { bookings: [pending, paid] }, 'vi', NOW)
  assert.equal(pay.lines.length, 1)
  assert.equal(pay.links[0].to, '/pay/p')
  assert.match(describeAccount('booking_payment', { bookings: [paid] }, 'vi', NOW).lines[0], /không có đơn nào đang chờ/)

  const quotes = { paid: { can_cancel: true, policy: 'moderate', refund_pct: 100, refund_amount: 1200000, demo: false } }
  assert.match(describeAccount('booking_cancel_refund', { bookings: [paid], quotes }, 'vi', NOW).lines[0], /huỷ bây giờ được hoàn 1\.200\.000đ \(100%, Vừa phải/)

  const tours = [{ title: 'Đà Lạt săn mây', starts_at: '2026-11-15T05:00:00+07:00', seats: 2, status: 'requested' }, { title: 'Cũ', starts_at: '2026-09-01', seats: 1, status: 'confirmed' }]
  const status = describeAccount('booking_status', { bookings: [pending, paid], tours }, 'vi', NOW)
  assert.equal(status.lines.length, 3)
  assert.match(status.lines[2], /^Tour: Đà Lạt săn mây · 15\/11 · 2 chỗ · chờ đối tác xác nhận/)
  assert.equal(describeAccount('tour_info', { tours: [] }, 'vi', NOW), null)
  assert.match(describeAccount('booking_status', {}, 'vi', NOW).lines[0], /chưa có đơn/)
})

test('a hand-off carries the conversation, short and in order', () => {
  const messages = [{ from: 'user', text: 'huỷ phòng' }, { from: 'bot', intent: 'booking_cancel_refund', reply: { text: 'x'.repeat(900) } }, { from: 'bot', reply: { text: '' } }]
  const t = transcriptOf(messages)
  assert.equal(t.length, 2)
  assert.deepEqual(t[0], { from: 'user', text: 'huỷ phòng' })
  assert.equal(t[1].text.length, 500)
  assert.equal(t[1].intent, 'booking_cancel_refund')
})

test('the hand-off and review migration keeps senders to their own account', () => {
  const sql = readFileSync('supabase/migrations/20261028090000_assistant_handoff_review.sql', 'utf8')
  assert.match(sql, /with check \(user_id is null or user_id = \(select auth\.uid\(\)\)\)/)
  assert.match(sql, /assistant_messages_admin_select[\s\S]*is_admin/)
  assert.doesNotMatch(sql, /grant [^;]* to anon/)
})
