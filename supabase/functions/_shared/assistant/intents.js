// What the FoodTrip assistant understands: the intents a message can have, the
// slots (pieces of information) it can carry, and the answers to questions
// about the website. One copy, plain JS, shared by the `assistant` Edge
// Function (Deno), the chat in the browser, the dataset generator and its
// tests (Node). The trained model (ml/assistant) predicts these same ids.
//
// Answers describe what the site really does (see test/ECOSYSTEM.md) — when a
// rule changes there, change it here too.

/** Slot types, tagged BIO on the message's words (B-DEST, I-DEST, …). */
export const SLOTS = ['DEST', 'DURATION', 'DATE', 'BUDGET', 'PEOPLE', 'TRANSPORT', 'PREF', 'FOOD', 'PLACE', 'DAY']
export const SLOT_LABELS = ['O', ...SLOTS.flatMap((s) => [`B-${s}`, `I-${s}`])]

/**
 * group: 'plan' (handled by the planner), 'help' (answered from below),
 * 'chat' (small talk). `answer` is the reply, with `links` to the page that does it.
 */
export const INTENTS = [
  { id: 'plan_trip', group: 'plan', label: 'Lên lịch trình' },
  { id: 'modify_plan', group: 'plan', label: 'Sửa lịch trình',
    answer: { vi: 'Mở chuyến đi trong “Chuyến đi của tôi”, bấm vào một điểm dừng để đổi quán, kéo để đổi thứ tự, hoặc đổi phương tiện. Muốn thêm hay bớt ngày, hãy tạo lại lịch trình với số ngày mới — các lựa chọn cũ được giữ.', en: 'Open the trip in “My trips”, tap a stop to swap the place, drag to reorder, or change transport. To add or remove days, plan again with the new length — your choices are kept.' },
    links: [{ to: '/trips', vi: 'Chuyến đi của tôi', en: 'My trips' }, { to: '/plan', vi: 'Tạo lịch trình', en: 'Plan a trip' }] },
  // Answered by computing, in the browser, from FoodTrip's data and the trip being
  // talked about (src/lib/assistantAnswers.js); `answer` is said when that cannot run.
  { id: 'estimate_cost', group: 'compute', label: 'Ước tính chi phí',
    answer: { vi: 'Cho mình biết điểm đến, số ngày và số người (ví dụ “Đà Lạt 3 ngày 2 người hết bao nhiêu?”), mình ước tính tiền phòng và ăn uống từ dữ liệu FoodTrip.', en: 'Tell me the destination, days and people (e.g. “how much for 3 days in Da Lat for 2?”) and I’ll estimate rooms and food from FoodTrip’s data.' },
    links: [{ to: '/plan', vi: 'Tạo lịch trình', en: 'Plan a trip' }] },
  { id: 'ask_weather', group: 'compute', label: 'Thời tiết',
    answer: { vi: 'Cho mình biết điểm đến và thời gian (ví dụ “thời tiết Đà Lạt cuối tuần này”), mình xem dự báo cho bạn.', en: 'Tell me the destination and dates (e.g. “weather in Da Lat this weekend”) and I’ll check the forecast.' } },
  { id: 'place_info', group: 'compute', label: 'Thông tin quán',
    answer: { vi: 'Cho mình tên quán và khu vực (ví dụ “Phở Thìn Lò Đúc mấy giờ mở cửa?”), mình tra giờ mở cửa, địa chỉ và đánh giá.', en: 'Give me the place name and area (e.g. “when does Phở Thìn Lò Đúc open?”) and I’ll look up hours, address and rating.' },
    links: [{ to: '/explore', vi: 'Khám phá', en: 'Explore' }] },
  { id: 'find_food', group: 'plan', label: 'Tìm quán ăn',
    answer: { vi: 'Trang Khám phá tìm quán theo khu vực, loại món và điểm phù hợp; “Ăn gì gần đây?” tìm quanh vị trí của bạn và có vòng quay chọn món.', en: 'Explore finds places by area, dish and suitability score; “What to eat nearby?” searches around you and has a food wheel.' },
    links: [{ to: '/explore', vi: 'Khám phá', en: 'Explore' }, { to: '/nearby', vi: 'Ăn gì gần đây?', en: 'Nearby' }] },
  { id: 'booking_how', group: 'help', label: 'Cách đặt phòng',
    answer: { vi: 'Chỉ khách sạn/homestay là đối tác của FoodTrip mới đặt và thanh toán được trên web: chọn phòng, ngày và số khách rồi bấm Đặt. Các nơi khác hiện nhãn “Tham khảo” với liên kết sang Agoda, Traveloka hoặc Google Maps. Khi lên lịch trình, bước Khách sạn gợi ý nơi ở hợp ngân sách.', en: 'Only FoodTrip partner hotels and homestays can be booked and paid on the site: choose the room, dates and guests, then Book. Other places are marked “Reference” with links to Agoda, Traveloka or Google Maps. When planning, the Hotels step suggests stays within your budget.' },
    links: [{ to: '/plan', vi: 'Lên lịch kèm khách sạn', en: 'Plan with a hotel' }, { to: '/bookings', vi: 'Đặt phòng của tôi', en: 'My bookings' }] },
  { id: 'booking_payment', group: 'help', label: 'Thanh toán',
    answer: { vi: 'Thanh toán bằng chuyển khoản quét mã QR (SePay) hoặc VNPay. Phòng chỉ được giữ 30 phút khi chưa thanh toán; quá hạn đơn tự huỷ và trả phòng. Giao dịch chỉ được xác nhận khi máy chủ nhận được thông báo hợp lệ từ ngân hàng/VNPay. Nếu bạn chuyển khoản sau thời hạn, FoodTrip sẽ liên hệ để hoàn tiền.', en: 'Pay by QR bank transfer (SePay) or VNPay. Unpaid rooms are held for 30 minutes, then the order is cancelled and the room released. A payment is confirmed only when the server receives a valid notice from the bank or VNPay. If you transfer after the deadline, FoodTrip will contact you to refund it.' },
    links: [{ to: '/bookings', vi: 'Đặt phòng của tôi', en: 'My bookings' }] },
  { id: 'booking_cancel_refund', group: 'help', label: 'Huỷ & hoàn tiền',
    answer: { vi: 'Huỷ trong “Đặt phòng của tôi”. Mức hoàn theo chính sách của nơi ở: Linh hoạt hoàn 100% nếu huỷ trước ít nhất 1 ngày; Vừa phải hoàn 100% nếu trước ít nhất 5 ngày; Nghiêm ngặt hoàn 50% nếu trước ít nhất 7 ngày; Không hoàn tiền thì không hoàn. Web hiện số tiền được hoàn trước khi bạn xác nhận. Nếu khách sạn từ chối đơn đã thanh toán, bạn được hoàn đủ.', en: 'Cancel in “My bookings”. The refund follows the stay’s policy: Flexible refunds 100% at least 1 day before; Moderate 100% at least 5 days before; Strict 50% at least 7 days before; Non-refundable none. The amount is shown before you confirm. If the hotel rejects a paid booking, you get a full refund.' },
    links: [{ to: '/bookings', vi: 'Đặt phòng của tôi', en: 'My bookings' }] },
  { id: 'booking_status', group: 'help', label: 'Tình trạng đơn',
    answer: { vi: 'Xem mọi đơn phòng và yêu cầu tour trong “Đặt phòng của tôi”. Bạn nhận thông báo (chuông trên thanh menu) khi đơn được thanh toán, xác nhận, từ chối, huỷ hay hoàn tiền, và lời nhắc lúc 8 giờ sáng hôm trước ngày đi.', en: 'All room bookings and tour requests are in “My bookings”. You get a notification (the bell in the menu) when a booking is paid, confirmed, rejected, cancelled or refunded, and a reminder at 8 am the day before.' },
    links: [{ to: '/bookings', vi: 'Đặt phòng của tôi', en: 'My bookings' }] },
  { id: 'tour_info', group: 'help', label: 'Tour',
    answer: { vi: 'Khi lên lịch, chọn “Có tour” để xem tour khởi hành đúng nơi và ngày bạn đi; tour được xếp vào ngày của nó và giá tour trừ vào ngân sách. Gửi yêu cầu giữ chỗ trên trang tour — đơn vị tour xác nhận trong 48 giờ, quá hạn yêu cầu tự huỷ. Giá tour là giá báo, chưa thanh toán trên web.', en: 'When planning, choose “With a tour” to see departures where and when you travel; the tour is placed on its day and its price comes out of the budget. Request seats on the tour page — the operator confirms within 48 hours, or the request lapses. Tour prices are quotes; tours are not paid on the site.' },
    links: [{ to: '/plan', vi: 'Lên lịch có tour', en: 'Plan with a tour' }, { to: '/bookings#tours', vi: 'Tour của tôi', en: 'My tours' }] },
  { id: 'share_video', group: 'help', label: 'Chia sẻ quán từ video',
    answer: { vi: 'Ở “Chia sẻ quán”, dán link TikTok hoặc YouTube: FoodTrip đọc tiêu đề, mô tả, lời nói, thẻ vị trí và bình luận để gợi ý quán, bạn chọn đúng quán rồi đăng. Video là lịch trình thì có thể tạo kế hoạch giống vậy. Link Facebook/Instagram thì nhập tên quán để tìm.', en: 'In “Share a place”, paste a TikTok or YouTube link: FoodTrip reads the title, description, speech, location tag and comments to suggest the place; pick the right one and publish. If the video is an itinerary you can create a plan like it. For Facebook/Instagram links, type the place name.' },
    links: [{ to: '/share', vi: 'Chia sẻ quán', en: 'Share a place' }] },
  { id: 'saved_trips', group: 'help', label: 'Lưu & chia sẻ lịch trình',
    answer: { vi: 'Đăng nhập rồi bấm Lưu ở cuối lịch trình. Trong “Chuyến đi của tôi” bạn mở lại, chia sẻ bằng liên kết công khai, xuất Excel/PDF, hoặc “Bắt đầu chuyến đi” để cả nhóm theo dõi và dẫn đường trực tiếp.', en: 'Sign in and press Save at the end of the itinerary. In “My trips” you can reopen it, share a public link, export Excel/PDF, or “Start the trip” so the group can follow it with live navigation.' },
    links: [{ to: '/trips', vi: 'Chuyến đi của tôi', en: 'My trips' }] },
  { id: 'reviews', group: 'help', label: 'Đánh giá',
    answer: { vi: 'Bạn viết đánh giá trong “Đặt phòng của tôi” sau khi trả phòng (đơn đã thanh toán) hoặc sau khi tour kết thúc, trong vòng 180 ngày, và sửa được. Đánh giá hiện tên rút gọn như “Mai T.”; đối tác có thể phản hồi.', en: 'Write a review in “My bookings” after check-out (paid bookings) or after the tour ends, within 180 days; you can edit it. Reviews show a short name like “Mai T.”; partners can reply.' },
    links: [{ to: '/bookings', vi: 'Đặt phòng của tôi', en: 'My bookings' }] },
  { id: 'account', group: 'help', label: 'Tài khoản',
    answer: { vi: 'Bấm Đăng nhập trên thanh menu để đăng nhập hoặc tạo tài khoản; quên mật khẩu thì dùng “Quên mật khẩu” để nhận email đặt lại. Đăng nhập để đồng bộ địa điểm đã lưu, lịch trình và đặt phòng.', en: 'Use Sign in in the menu to sign in or create an account; if you forgot your password, use “Forgot password” to get a reset email. Signing in syncs saved places, trips and bookings.' },
    links: [{ to: '/forgot-password', vi: 'Quên mật khẩu', en: 'Forgot password' }] },
  { id: 'partner', group: 'help', label: 'Hợp tác',
    answer: { vi: 'Khách sạn/homestay đăng ký ở “Hợp tác với FoodTrip” → Đối tác lưu trú; đơn vị tour ở Đối tác tour. Đăng ký 4 bước (thông tin, liên hệ & giấy tờ, điều khoản, xác nhận); sau khi được duyệt, hoàn thành danh sách kiểm tra (ảnh, phòng & giá, chính sách, tài khoản nhận tiền) để bắt đầu nhận khách.', en: 'Hotels and homestays apply under “Partner with FoodTrip” → Stays; tour operators under Tours. Sign-up has 4 steps (details, contact & papers, terms, confirm); once approved, finish the checklist (photos, rooms & rates, policies, payout account) to start taking guests.' },
    links: [{ to: '/hop-tac', vi: 'Hợp tác với FoodTrip', en: 'Partner with FoodTrip' }] },
  { id: 'contact_support', group: 'help', label: 'Liên hệ',
    answer: { vi: 'Gửi lời nhắn ở trang Liên hệ — báo lỗi dữ liệu, góp ý hoặc đề nghị hợp tác. FoodTrip phản hồi qua email bạn để lại.', en: 'Send a message on the Contact page — data problems, suggestions or partnership requests. FoodTrip replies to the email you leave.' },
    links: [{ to: '/contact', vi: 'Liên hệ', en: 'Contact' }] },
  { id: 'greeting', group: 'chat', label: 'Chào',
    answer: { vi: 'Chào bạn! Mình là trợ lý FoodTrip. Bạn có thể nhờ mình lên lịch (“3 ngày ở Đà Lạt, 2 người, 3 triệu”) hoặc hỏi về đặt phòng, thanh toán, hoàn tiền, tour…', en: 'Hi! I’m the FoodTrip assistant. Ask me to plan (“3 days in Da Lat, 2 people, 3 million”) or about bookings, payment, refunds, tours…' } },
  { id: 'thanks', group: 'chat', label: 'Cảm ơn / tạm biệt',
    answer: { vi: 'Không có gì! Cần gì cứ hỏi mình nhé.', en: 'You’re welcome! Ask any time.' } },
  { id: 'out_of_scope', group: 'chat', label: 'Ngoài phạm vi',
    answer: { vi: 'Mình chỉ giúp được về lên lịch ăn chơi và cách dùng FoodTrip. Thử hỏi: “lên lịch 2 ngày ở Hội An”, “huỷ phòng có được hoàn tiền không?”.', en: 'I can only help with trip planning and using FoodTrip. Try: “plan 2 days in Hoi An” or “can I get a refund if I cancel?”.' } },
]

export const INTENT_IDS = INTENTS.map((i) => i.id)
export const intentById = (id) => INTENTS.find((i) => i.id === id) ?? INTENTS.find((i) => i.id === 'out_of_scope')
