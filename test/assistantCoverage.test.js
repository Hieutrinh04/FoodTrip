import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askAssistant } from '../src/lib/assistant.js'
import { resolveChatTurn } from '../src/lib/assistantConversation.js'
import { askedDish, paymentAvailabilityNote } from '../src/lib/assistantAnswers.js'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'
import { composeReply } from '../supabase/functions/_shared/assistant/reply.js'

// The site's features, as people ask about them: [question, intent, FAQ entry].
// Add a line here when adding a feature, so the chat learns about it too.
// A null entry means a computed or general answer rather than a specific FAQ.
const VI = [
  // Itineraries
  ['lên lịch 3 ngày ở Đà Nẵng 2 người 5 triệu', 'plan_trip', null],
  ['sửa lịch trình của tôi thế nào', 'modify_plan', 'plan-edit-stops'],
  ['đổi quán trong lịch trình', 'modify_plan', 'plan-edit-stops'],
  ['lưu lịch trình kiểu gì', 'saved_trips', 'trips-save'],
  ['xuất lịch trình ra excel', 'saved_trips', 'trips-export'],
  ['xuất pdf được không', 'saved_trips', 'trips-export'],
  ['chia sẻ lịch trình cho bạn', 'saved_trips', 'trips-share'],
  ['thu hồi link chia sẻ', 'saved_trips', 'trips-share'],
  ['lịch trình có tối ưu đường đi không', 'plan_trip', 'plan-route-order'],
  // Live trips
  ['bắt đầu chuyến đi', 'saved_trips', 'trips-live'],
  ['chia sẻ vị trí cho nhóm', 'saved_trips', 'trips-live'],
  ['mời bạn vào phòng hành trình', 'saved_trips', 'trips-live-invite'],
  ['dẫn đường đến quán', 'saved_trips', 'trips-live'],
  ['gps không chạy', 'saved_trips', 'trips-live-trouble'],
  // Finding food
  ['quán phở ngon ở Hà Nội', 'find_food', null],
  ['bún chả ở Hà Nội', 'find_food', null],
  ['quán chay ở Huế', 'find_food', null],
  ['cà phê ở Đà Lạt', 'find_food', null],
  ['quán nào đang mở cửa ở Hội An', 'find_food', null],
  ['quán dưới 100k ở Đà Nẵng', 'find_food', null],
  ['ăn gì gần đây', 'find_food', null],
  ['ăn gì bây giờ', 'find_food', null],
  ['quay món ăn', 'find_food', 'explore-nearby'],
  ['vòng quay chọn món là gì', 'find_food', 'explore-nearby'],
  // Places
  ['Phở Thìn Lò Đúc mấy giờ mở cửa', 'place_info', null],
  ['địa chỉ Phở Thìn', 'place_info', null],
  ['xem 360 street view', 'find_food', 'explore-360'],
  ['lưu quán yêu thích', 'saved_trips', 'saved-places'],
  ['địa điểm đã lưu ở đâu', 'saved_trips', 'saved-places'],
  ['điểm phù hợp tính thế nào', 'find_food', 'explore-score'],
  ['dữ liệu mẫu là gì', 'find_food', 'explore-sample'],
  ['điểm tham quan ở Huế', 'find_food', 'explore-attractions'],
  ['chỗ chơi ở Đà Lạt', 'find_food', 'explore-attractions'],
  // Weather and cost
  ['thời tiết Đà Lạt cuối tuần', 'ask_weather', null],
  ['có mưa không', 'ask_weather', null],
  ['Đà Lạt 3 ngày 2 người hết bao nhiêu', 'estimate_cost', null],
  ['mang bao nhiêu tiền đi Huế', 'estimate_cost', null],
  // Stays
  ['đặt phòng thế nào', 'booking_how', 'book-how'],
  ['khách sạn ở Đà Nẵng', 'booking_how', 'book-find-hotel'],
  ['khách sạn nào rẻ ở Huế', 'booking_how', 'book-find-hotel'],
  ['sao không đặt được khách sạn này', 'booking_how', 'book-reference-label'],
  ['đơn của tôi sao rồi', 'booking_status', null],
  ['thanh toán thế nào', 'booking_payment', 'pay-methods'],
  ['chuyển khoản rồi chưa thấy cập nhật', 'booking_payment', 'pay-confirm-time'],
  ['giữ phòng bao lâu', 'booking_payment', 'pay-hold-30'],
  ['huỷ phòng có hoàn tiền không', 'booking_cancel_refund', 'refund-policy'],
  ['bao lâu nhận được tiền hoàn', 'booking_cancel_refund', 'refund-when'],
  ['khách sạn từ chối đơn thì sao', 'booking_cancel_refund', 'refund-hotel-rejects'],
  ['viết đánh giá thế nào', 'reviews', 'review-when'],
  // Tours
  ['có tour nào ở Đà Nẵng', 'tour_info', null],
  ['đặt tour thế nào', 'tour_info', null],
  ['thanh toán tour ra sao', 'tour_info', 'tour-price-payment'],
  ['huỷ tour', 'booking_cancel_refund', 'refund-tour'],
  ['hướng dẫn viên xem đoàn ở đâu', 'partner', 'partner-guide'],
  // Community and sharing
  ['đăng bài cộng đồng thế nào', 'share_video', 'community-post'],
  ['xoá bài viết của tôi', 'share_video', 'community-manage'],
  ['bình luận bài viết', 'share_video', 'community-post'],
  ['chia sẻ quán từ tiktok', 'share_video', 'share-how'],
  ['dán link youtube tìm quán', 'share_video', null],
  // Account and settings
  ['quên mật khẩu', 'account', 'account-signin'],
  ['đăng ký tài khoản', 'account', 'account-signin'],
  ['đổi mật khẩu', 'account', 'account-signin'],
  ['xoá tài khoản của tôi', 'account', 'account-delete'],
  ['trang tài khoản ở đâu', 'account', 'account-page'],
  ['thông báo ở đâu', 'booking_status', 'status-notifications'],
  ['đổi ngôn ngữ', 'account', 'site-settings'],
  ['bật giao diện tối', 'account', 'site-settings'],
  ['dữ liệu của tôi được dùng thế nào', 'account', 'site-privacy'],
  ['quyền riêng tư', 'account', 'site-privacy'],
  // Partners
  ['đăng ký làm đối tác khách sạn', 'partner', 'partner-stay-signup'],
  ['đăng ký đơn vị tour', 'partner', 'partner-tour-signup'],
  ['thêm phòng thế nào', 'partner', 'partner-rooms'],
  ['đổi giá phòng', 'partner', 'partner-rooms'],
  ['xem doanh thu cơ sở', 'partner', 'partner-revenue'],
  ['thêm nhân viên', 'partner', 'partner-team'],
  ['phí hoa hồng bao nhiêu', 'partner', 'partner-commission'],
  ['đối soát khi nào', 'partner', 'partner-revenue'],
  ['duyệt đối tác ở đâu', 'partner', 'partner-approval'],
  // Conversation
  ['xin chào', 'greeting', null],
  ['cảm ơn', 'thanks', null],
  ['bạn là ai', 'out_of_scope', 'assistant-privacy'],
  ['gặp nhân viên', 'contact_support', 'contact'],
  ['báo lỗi', 'contact_support', null],
  // Genuinely out of scope stays out of scope
  ['giá vàng hôm nay', 'out_of_scope', null],
  ['viết code giúp tôi', 'out_of_scope', null],
]
const EN = [
  ['plan 3 days in Da Nang', 'plan_trip', null],
  ['good pho in Hanoi', 'find_food', null],
  ['find seafood in Da Nang', 'find_food', null],
  ['weather in Hue', 'ask_weather', null],
  ['how do I cancel my booking', 'booking_cancel_refund', null],
  ['how do I pay', 'booking_payment', null],
  ['forgot password', 'account', 'account-signin'],
  ['become a partner', 'partner', null],
  ['share my location with friends', 'saved_trips', 'trips-live'],
  ['delete my account', 'account', 'account-delete'],
]

for (const [lang, table] of [['vi', VI], ['en', EN]]) {
  test(`the chat knows the site's features (${lang})`, async () => {
    const wrong = []
    for (const [question, intent, faq] of table) {
      const reading = await askAssistant(question, lang, [])
      const { answer } = resolveChatTurn(question, reading, { lang })
      if (answer.intent !== intent || (faq && answer.faq !== faq)) wrong.push(`${question}: ${answer.intent}/${answer.faq} ≠ ${intent}/${faq}`)
    }
    assert.deepEqual(wrong, [])
  })
}

test('a how-to question about planning answers it, without starting a trip', () => {
  for (const question of ['xuất lịch trình ra excel', 'lịch trình có tối ưu đường đi không', 'lịch trình được tạo thế nào']) {
    const { answer, updatePlan } = resolveChatTurn(question, composeReply(question, ruleIntent(question), 'vi'), { lang: 'vi' })
    assert.ok(answer.faq, question)
    assert.equal(updatePlan, false, question)
  }
  const { updatePlan } = resolveChatTurn('lên lịch 3 ngày ở Huế', composeReply('lên lịch 3 ngày ở Huế', ruleIntent('lên lịch 3 ngày ở Huế'), 'vi'), { lang: 'vi' })
  assert.equal(updatePlan, true)
})

test('an older server that does not know an FAQ answer yields to the local one', () => {
  const stale = { intent: 'out_of_scope', faq: null, reply: { text: 'old', links: [] }, slots: [] }
  const { answer } = resolveChatTurn('quyền riêng tư', stale, { lang: 'vi' })
  assert.equal(answer.faq, 'site-privacy')
  const wrongFaq = { intent: 'tour_info', faq: 'tour-price-payment', reply: { text: 'old', links: [] }, slots: [] }
  assert.equal(resolveChatTurn('thanh toán thế nào', wrongFaq, { lang: 'vi' }).answer.faq, 'pay-methods')
  const stalePlan = { intent: 'plan_trip', faq: null, reply: { text: 'old', links: [] }, slots: [] }
  assert.equal(resolveChatTurn('xuất lịch trình ra excel', stalePlan, { lang: 'vi' }).answer.faq, 'trips-export')
})

test('a price or an open-now question is not mistaken for a dish', () => {
  assert.equal(askedDish('quán dưới 100k ở Đà Nẵng', []), null)
  assert.equal(askedDish('quán nào đang mở cửa ở Hội An', []), null)
  assert.equal(askedDish('quán phở dưới 100k ở Hà Nội', []), 'phở')
})

test('payment answers state what is really available right now', () => {
  assert.match(paymentAvailabilityNote({ sepay: 'mock', vnpay: 'no-key' }, 'vi'), /chế độ thử/)
  assert.match(paymentAvailabilityNote({ sepay: 'mock', vnpay: 'no-key' }, 'en'), /test mode/)
  assert.match(paymentAvailabilityNote({ sepay: 'no-key', vnpay: 'no-key' }, 'vi'), /chưa mở/)
  assert.match(paymentAvailabilityNote({ sepay: 'no-key', vnpay: 'ready' }, 'vi'), /VNPay/)
  // VNPay here is a sandbox, so it is never presented as taking real money.
  assert.match(paymentAvailabilityNote({ sepay: 'no-key', vnpay: 'ready' }, 'en'), /sandbox/)
  assert.equal(paymentAvailabilityNote({ sepay: 'ready', vnpay: 'no-key' }, 'vi'), null)
  assert.equal(paymentAvailabilityNote({ sepay: 'unknown', vnpay: 'unknown' }, 'vi'), null)
})
