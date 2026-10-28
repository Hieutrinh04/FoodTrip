// FoodTrip's question-and-answer base: specific answers, finer than one answer
// per intent. The assistant finds the entry closest to a question — with words
// now (faqRetrieve, below), with the trained retriever on the Space when it is
// deployed (ml/assistant/train_retriever.py) — and answers with that entry's
// text. Answers are written here from what the site does (test/ECOSYSTEM.md);
// nothing is generated.
//
// q:    ways people ask it (training data for the retriever)
// test: one more way, kept out of training (measures new phrasings)

import { plain } from '../placeNames.js'

const L = {
  bookings: { to: '/bookings', vi: 'Đặt phòng của tôi', en: 'My bookings' },
  tours: { to: '/bookings#tours', vi: 'Tour của tôi', en: 'My tours' },
  plan: { to: '/plan', vi: 'Tạo lịch trình', en: 'Plan a trip' },
  trips: { to: '/trips', vi: 'Chuyến đi của tôi', en: 'My trips' },
  share: { to: '/share', vi: 'Chia sẻ quán', en: 'Share a place' },
  explore: { to: '/explore', vi: 'Khám phá', en: 'Explore' },
  nearby: { to: '/nearby', vi: 'Ăn gì gần đây?', en: 'Nearby' },
  partner: { to: '/hop-tac', vi: 'Hợp tác với FoodTrip', en: 'Partner with FoodTrip' },
  contact: { to: '/contact', vi: 'Liên hệ', en: 'Contact' },
  saved: { to: '/saved', vi: 'Đã lưu', en: 'Saved' },
  forgot: { to: '/forgot-password', vi: 'Quên mật khẩu', en: 'Forgot password' },
  help: { to: '/help', vi: 'Trợ giúp', en: 'Help' },
}

export const FAQ = [
  // — Booking a stay —
  { id: 'book-how', intent: 'booking_how', links: [L.plan, L.bookings],
    q: ['làm sao để đặt phòng', 'đặt khách sạn trên web thế nào', 'các bước đặt phòng', 'muốn book phòng thì làm gì'], test: 'hướng dẫn mình đặt phòng với',
    a: { vi: 'Mở trang của khách sạn đối tác (từ bước Khách sạn khi lên lịch, hoặc từ trang khách sạn), chọn ngày, số khách và loại phòng rồi bấm Đặt phòng. Sau đó thanh toán trong 30 phút bằng chuyển khoản QR hoặc VNPay. Đơn hiện trong “Đặt phòng của tôi”.', en: 'Open a partner hotel’s page (from the Hotels step when planning, or the hotel page), pick dates, guests and room, then Book. Pay within 30 minutes by QR transfer or VNPay. The booking appears in “My bookings”.' } },
  { id: 'book-reference-label', intent: 'booking_how', links: [L.partner],
    q: ['khách sạn có nhãn tham khảo là sao', 'sao khách sạn này không đặt được', 'tham khảo nghĩa là gì', 'tại sao không có nút đặt phòng'], test: 'sao chỗ này chỉ có link agoda mà không đặt được',
    a: { vi: 'Nhãn “Tham khảo” là nơi ở FoodTrip tìm thấy nhưng chưa là đối tác: web không nhận đặt và thanh toán cho nơi đó, chỉ dẫn sang Agoda, Traveloka hoặc Google Maps. Chỉ khách sạn/homestay đối tác đã bật bán phòng mới đặt được trên FoodTrip.', en: '“Reference” marks a place FoodTrip found but that is not a partner: the site takes no bookings or payments for it and links to Agoda, Traveloka or Google Maps instead. Only partner hotels and homestays with sales switched on can be booked on FoodTrip.' } },
  { id: 'book-hotel-budget', intent: 'booking_how', links: [L.plan],
    q: ['khách sạn được gợi ý theo ngân sách thế nào', 'vì sao gợi ý khách sạn này', 'ngân sách phòng mỗi đêm tính sao', 'khách sạn trong ngân sách là gì'], test: 'web tính tiền phòng mỗi đêm từ ngân sách như nào',
    a: { vi: 'Khi lên lịch, FoodTrip dành khoảng 35% tổng ngân sách (ngân sách/người × số người) cho chỗ ở rồi chia cho số đêm. Khách sạn được xếp: trong ngân sách, rẻ hơn hẳn, chưa có giá, rồi vượt ngân sách. Nơi có giá thật (đối tác, Hotelbeds) hiện đúng giá; nơi khác chỉ hiện mức ước tính.', en: 'When planning, FoodTrip sets about 35% of the whole budget (per person × people) aside for the stay and spreads it over the nights. Hotels are listed: within budget, much cheaper, no price, then over budget. Places with real rates (partners, Hotelbeds) show them; others show an estimated band.' } },
  // — Payment —
  { id: 'pay-methods', intent: 'booking_payment', links: [L.bookings],
    q: ['thanh toán bằng cách nào', 'có những cách trả tiền nào', 'trả bằng vnpay được không', 'thanh toán qua đâu'], test: 'mình trả tiền phòng kiểu gì',
    a: { vi: 'Hai cách: chuyển khoản ngân hàng bằng mã QR (SePay) — mở app ngân hàng, quét mã, số tiền và nội dung đã điền sẵn — hoặc thanh toán qua VNPay.', en: 'Two ways: a bank transfer by QR code (SePay) — open your banking app and scan; the amount and note are filled in — or VNPay.' } },
  { id: 'pay-hold-30', intent: 'booking_payment', links: [L.bookings],
    q: ['giữ phòng bao lâu', 'chưa thanh toán thì phòng giữ được bao lâu', 'quá 30 phút chưa trả tiền thì sao', 'đơn hết hạn thanh toán là sao'], test: 'đặt rồi để đó chưa chuyển tiền có sao không',
    a: { vi: 'Phòng chỉ được giữ 30 phút khi chưa thanh toán. Quá hạn, đơn tự huỷ và phòng được trả lại cho người khác đặt; bạn có thể đặt lại nếu còn phòng.', en: 'An unpaid room is held for 30 minutes. After that the booking is cancelled automatically and the room released; you can book again if it is still free.' } },
  { id: 'pay-transfer-note', intent: 'booking_payment', links: [L.bookings],
    q: ['nội dung chuyển khoản ghi gì', 'chuyển khoản có cần ghi chú không', 'ghi sai nội dung chuyển khoản', 'quên ghi nội dung chuyển khoản'], test: 'chuyển khoản phải ghi mã gì',
    a: { vi: 'Ghi đúng nội dung chuyển khoản hiện trên trang thanh toán (quét QR thì đã điền sẵn) — FoodTrip dựa vào nó để nhận ra đơn của bạn. Nếu ghi sai hoặc thiếu, hãy gửi lời nhắn ở trang Liên hệ kèm thời gian và số tiền chuyển.', en: 'Use exactly the transfer note shown on the payment page (the QR fills it in) — it is how FoodTrip recognises your booking. If it was wrong or missing, send a message on the Contact page with the time and amount.' } },
  { id: 'pay-confirm-time', intent: 'booking_payment', links: [L.bookings],
    q: ['chuyển khoản xong bao lâu thì xác nhận', 'đã chuyển tiền mà đơn vẫn chờ', 'thanh toán rồi sao chưa thấy cập nhật', 'bao giờ đơn chuyển sang đã thanh toán'], test: 'mình chuyển rồi mà vẫn hiện chờ thanh toán',
    a: { vi: 'Đơn chuyển sang “Đã thanh toán” ngay khi máy chủ nhận được thông báo hợp lệ từ ngân hàng hoặc VNPay, thường trong vài phút; bạn cũng nhận thông báo ở chuông. Nếu sau 30 phút vẫn chưa đổi, hãy kiểm tra lại nội dung chuyển khoản và liên hệ FoodTrip.', en: 'The booking turns “Paid” as soon as the server gets a valid notice from the bank or VNPay, usually within minutes; you also get a notification. If it has not changed after 30 minutes, check the transfer note and contact FoodTrip.' } },
  { id: 'pay-late-transfer', intent: 'booking_payment', links: [L.contact],
    q: ['chuyển khoản trễ có sao không', 'chuyển tiền sau khi đơn hết hạn', 'đơn bị huỷ mà mình đã chuyển tiền', 'trả tiền muộn thì có mất tiền không'], test: 'lỡ chuyển khoản sau 30 phút thì tiền đi đâu',
    a: { vi: 'Nếu bạn chuyển khoản sau khi đơn đã hết hạn, khoản tiền không gắn vào đơn nào; FoodTrip ghi nhận và liên hệ để hoàn lại cho bạn. Bạn có thể gửi lời nhắn ở trang Liên hệ cho nhanh.', en: 'A transfer made after the booking expired is not attached to any booking; FoodTrip records it and contacts you to refund it. You can also send a message on the Contact page.' } },
  { id: 'pay-demo', intent: 'booking_payment', links: [],
    q: ['chế độ demo là gì', 'đơn thử có mất tiền thật không', 'sepay mocktest là gì'], test: 'sao đơn của mình ghi là demo',
    a: { vi: 'Đơn ghi “demo/mocktest” là giao dịch thử: không có tiền thật, không được đối soát hay hoàn tiền thật. Chế độ này luôn được ghi rõ trên đơn.', en: 'A booking marked “demo/mock test” is a test transaction: no real money, no real payout or refund. It is always labelled.' } },
  // — Cancellation and refunds —
  { id: 'refund-policy', intent: 'booking_cancel_refund', links: [L.bookings],
    q: ['chính sách hoàn tiền thế nào', 'huỷ phòng được hoàn bao nhiêu', 'hoàn tiền mấy phần trăm', 'huỷ trước mấy ngày thì được hoàn'], test: 'huỷ trước 3 ngày có lấy lại tiền được không',
    a: { vi: 'Theo chính sách của nơi ở, ghi trên trang đặt phòng: Linh hoạt — hoàn 100% nếu huỷ trước ít nhất 1 ngày; Vừa phải — hoàn 100% nếu trước ít nhất 5 ngày; Nghiêm ngặt — hoàn 50% nếu trước ít nhất 7 ngày; Không hoàn tiền — không hoàn. Huỷ muộn hơn mốc thì không được hoàn. Web hiện số tiền được hoàn trước khi bạn xác nhận huỷ.', en: 'It follows the stay’s policy, shown on its booking page: Flexible — 100% back at least 1 day before; Moderate — 100% at least 5 days before; Strict — 50% at least 7 days before; Non-refundable — nothing. Later than that, no refund. The amount is shown before you confirm.' } },
  { id: 'refund-how-cancel', intent: 'booking_cancel_refund', links: [L.bookings],
    q: ['làm sao để huỷ đơn', 'huỷ đặt phòng ở đâu', 'muốn huỷ phòng', 'cách huỷ booking'], test: 'nút huỷ đơn nằm chỗ nào',
    a: { vi: 'Vào “Đặt phòng của tôi”, mở đơn và bấm Huỷ. Với đơn đã thanh toán, web hiện số tiền được hoàn theo chính sách và hỏi tài khoản nhận tiền hoàn trước khi xác nhận. Đơn chưa thanh toán thì huỷ ngay, không mất gì.', en: 'Go to “My bookings”, open the booking and press Cancel. For a paid booking the site shows the refund under the policy and asks for the account to refund to before you confirm. An unpaid booking is simply cancelled.' } },
  { id: 'refund-hotel-rejects', intent: 'booking_cancel_refund', links: [L.bookings],
    q: ['khách sạn từ chối đơn thì sao', 'khách sạn huỷ đơn của mình', 'đơn bị từ chối có được hoàn tiền không'], test: 'bên khách sạn không nhận đơn thì tiền mình sao',
    a: { vi: 'Nếu khách sạn từ chối đơn bạn đã thanh toán, bạn được hoàn đủ 100% và nhận thông báo.', en: 'If the hotel declines a booking you paid for, you get a full refund and a notification.' } },
  { id: 'refund-when', intent: 'booking_cancel_refund', links: [L.bookings],
    q: ['bao lâu thì nhận được tiền hoàn', 'tiền hoàn về tài khoản nào', 'khi nào hoàn tiền xong', 'đã huỷ mà chưa thấy tiền hoàn'], test: 'huỷ rồi bao giờ tiền về',
    a: { vi: 'FoodTrip chuyển tiền hoàn vào tài khoản bạn khai khi huỷ; khi chuyển xong, đơn đổi sang “Đã hoàn tiền” và bạn nhận thông báo. Nếu lâu chưa thấy, hãy gửi lời nhắn ở trang Liên hệ.', en: 'FoodTrip transfers the refund to the account you gave when cancelling; when it is done the booking shows “Refunded” and you get a notification. If it takes long, write via the Contact page.' } },
  { id: 'refund-tour', intent: 'booking_cancel_refund', links: [L.tours],
    q: ['huỷ tour có mất phí không', 'huỷ yêu cầu giữ chỗ tour', 'không đi tour nữa thì làm sao'], test: 'mình muốn bỏ tour đã đặt',
    a: { vi: 'Bạn huỷ yêu cầu tour trong “Đặt phòng của tôi” → Tour trước ngày khởi hành; chỗ được trả lại cho đơn vị tour. Tour chưa thanh toán trên FoodTrip nên huỷ không mất phí trên web — điều khoản riêng của đơn vị tour vẫn áp dụng nếu bạn đã trả cho họ.', en: 'Cancel the tour request in “My bookings” → Tours before departure; the seats go back to the operator. Tours are not paid on FoodTrip, so there is no fee on the site — the operator’s own terms apply if you paid them.' } },
  // — Status and notifications —
  { id: 'status-where', intent: 'booking_status', links: [L.bookings],
    q: ['xem đơn đặt phòng ở đâu', 'đơn của mình nằm ở đâu', 'kiểm tra tình trạng đơn', 'xem lại tour đã đặt'], test: 'mình muốn xem lại các đơn đã đặt',
    a: { vi: 'Tất cả đơn phòng và yêu cầu tour nằm trong “Đặt phòng của tôi” (cần đăng nhập), kèm trạng thái: chờ thanh toán, đã thanh toán, đã xác nhận, đã huỷ, đã hoàn tiền.', en: 'All room bookings and tour requests are in “My bookings” (sign in), with their status: payment pending, paid, confirmed, cancelled, refunded.' } },
  { id: 'status-notifications', intent: 'booking_status', links: [L.bookings],
    q: ['thông báo ở đâu', 'sao không thấy thông báo', 'có nhắc lịch trước ngày đi không', 'cái chuông để làm gì'], test: 'web có báo khi khách sạn xác nhận không',
    a: { vi: 'Chuông trên thanh menu hiện thông báo khi đơn được thanh toán, xác nhận, từ chối, huỷ hoặc hoàn tiền, khi tour được xác nhận, và lời nhắc lúc 8 giờ sáng hôm trước ngày ở hoặc ngày đi tour.', en: 'The bell in the menu shows notifications when a booking is paid, confirmed, rejected, cancelled or refunded, when a tour is confirmed, and a reminder at 8 am the day before your stay or tour.' } },
  // — Tours —
  { id: 'tour-in-plan', intent: 'tour_info', links: [L.plan],
    q: ['lên lịch có kèm tour được không', 'tìm tour ở đâu', 'có tour không', 'đi tour hay tự túc'], test: 'mình muốn lịch trình có tour',
    a: { vi: 'Khi lên lịch, ở bước “Tự túc hay đi tour” chọn “Có tour dẫn đường”: FoodTrip hiện tour của đối tác khởi hành đúng nơi và những ngày bạn đi. Tour được xếp vào ngày của nó, lịch trình chừa giờ tour, giá tour được trừ khỏi ngân sách trước khi gợi ý khách sạn.', en: 'When planning, at “Self-guided or tour” choose a tour: FoodTrip shows partner departures where and when you travel. The tour is placed on its day, the itinerary leaves its hours free, and its price comes out of the budget before hotels are suggested.' } },
  { id: 'tour-confirm-48h', intent: 'tour_info', links: [L.tours],
    q: ['giữ chỗ tour bao lâu thì được xác nhận', 'đặt tour xong chờ bao lâu', 'tour chưa xác nhận thì sao'], test: 'gửi yêu cầu tour rồi mà chưa thấy trả lời',
    a: { vi: 'Đơn vị tour xác nhận yêu cầu giữ chỗ trong 48 giờ. Quá 48 giờ (hoặc tới ngày khởi hành) chưa xác nhận thì yêu cầu tự huỷ và chỗ được trả lại.', en: 'The operator confirms a seat request within 48 hours. If it is not confirmed by then (or by departure), the request lapses and the seats are released.' } },
  { id: 'tour-price-payment', intent: 'tour_info', links: [L.tours],
    q: ['thanh toán tour thế nào', 'giá tour đã gồm gì', 'tour trả tiền ở đâu'], test: 'đặt tour có phải trả tiền trên web không',
    a: { vi: 'Giá tour trên FoodTrip là giá báo của đơn vị tour; tour chưa được thanh toán trên web. Sau khi xác nhận, đơn vị tour liên hệ bạn. Trang tour ghi rõ lịch trình, những gì bao gồm và chính sách huỷ.', en: 'The tour price on FoodTrip is the operator’s quote; tours are not paid on the site. Once confirmed, the operator contacts you. The tour page shows the schedule, inclusions and cancellation policy.' } },
  { id: 'tour-page-share', intent: 'tour_info', links: [L.plan],
    q: ['chia sẻ trang tour cho bạn', 'lên lịch quanh một tour', 'trang tour có những gì'], test: 'có cách nào lên lịch dựa trên tour mình thích không',
    a: { vi: 'Mỗi tour có trang riêng: chia sẻ/chép liên kết, chọn ngày khởi hành và số người, gửi yêu cầu giữ chỗ, hoặc “Lên lịch quanh tour này” — trang Lịch trình mở sẵn điểm đến, ngày và tour.', en: 'Each tour has its own page: share or copy the link, choose a departure and party size, request seats, or “Plan a trip around this tour” — the planner opens with the destination, dates and tour filled in.' } },
  // — Planner —
  { id: 'plan-how', intent: 'plan_trip', links: [L.plan],
    q: ['lịch trình được tạo thế nào', 'web xếp lịch dựa vào đâu', 'ai lên lịch trình cho mình', 'lịch trình có phải AI tạo không'], test: 'FoodTrip chọn quán cho lịch trình kiểu gì',
    a: { vi: 'FoodTrip chấm điểm từng địa điểm theo sở thích, ngân sách, đánh giá thật, giờ mở cửa và khoảng cách, rồi xếp vào các khung giờ (sáng, trưa, chiều, tối) và sắp thứ tự để bớt đường đi. Bạn sửa được mọi điểm trước khi lưu.', en: 'FoodTrip scores each place on your interests, budget, real ratings, opening hours and distance, fits them into time slots (morning to evening) and orders them to cut travel. You can change every stop before saving.' } },
  { id: 'plan-budget-meaning', intent: 'plan_trip', links: [L.plan],
    q: ['ngân sách là cho một người hay cả nhóm', 'ngân sách tính thế nào', 'ngân sách gồm những gì'], test: 'số tiền nhập vào là tổng hay mỗi người',
    a: { vi: 'Ngân sách trong trang Lịch trình là cho mỗi người, cả chuyến. Khoảng 35% dành cho chỗ ở, phần còn lại cho ăn uống, đi lại và vé; tour (nếu có) được trừ trước.', en: 'The planner’s budget is per person for the whole trip. About 35% goes to the stay, the rest to food, getting around and tickets; a tour, if any, is taken out first.' } },
  { id: 'plan-custom-city', intent: 'plan_trip', links: [L.plan],
    q: ['điểm đến không có trong danh sách thì sao', 'lên lịch cho tỉnh khác được không', 'sao không có thành phố của mình'], test: 'mình muốn đi Quy Nhơn mà không thấy trong list',
    a: { vi: 'Gõ tên nơi bạn muốn đi ở bước Điểm đến: FoodTrip tìm quán ăn, cà phê và điểm tham quan có thật ở đó trên bản đồ để bạn chọn, rồi xếp lịch từ những nơi đó.', en: 'Type the place at the Destination step: FoodTrip finds real restaurants, cafés and sights there on the map for you to pick, then plans from them.' } },
  { id: 'plan-edit-stops', intent: 'modify_plan', links: [L.trips],
    q: ['đổi quán trong lịch trình', 'sửa lịch trình thế nào', 'đổi thứ tự điểm đến', 'thay điểm dừng'], test: 'mình không thích quán này muốn đổi',
    a: { vi: 'Trong lịch trình, bấm một điểm dừng để xem gợi ý thay thế cùng loại, kéo để đổi thứ tự (giờ giữ nguyên theo vị trí), hoặc đổi phương tiện — khoảng cách được tính lại. Lưu lại để giữ thay đổi.', en: 'In the itinerary, tap a stop for alternatives of the same kind, drag to reorder (times stay with the slots), or change transport — distances are recalculated. Save to keep the changes.' } },
  { id: 'plan-weather', intent: 'ask_weather', links: [L.plan],
    q: ['lịch trình có xem thời tiết không', 'dự báo thời tiết trong chuyến đi ở đâu'], test: 'web có báo mưa trong mấy ngày đi không',
    a: { vi: 'Trang Lịch trình hiện dự báo từng ngày (Open-Meteo) khi ngày đi trong vòng 16 ngày tới; xa hơn thì cảnh báo theo mùa mưa bão của vùng.', en: 'The planner shows a daily forecast (Open-Meteo) when the trip is within 16 days; further ahead it warns by the region’s rainy and storm seasons.' } },
  // — Saved trips —
  { id: 'trips-save', intent: 'saved_trips', links: [L.trips],
    q: ['lưu lịch trình thế nào', 'lịch trình đã lưu ở đâu', 'mất lịch trình vừa tạo', 'sao không lưu được lịch trình'], test: 'tạo xong lịch rồi muốn giữ lại',
    a: { vi: 'Đăng nhập rồi bấm Lưu ở cuối lịch trình; mọi chuyến đã lưu nằm trong “Chuyến đi của tôi”. Chưa lưu mà rời trang thì lịch trình không được giữ.', en: 'Sign in and press Save at the end of the itinerary; saved trips are in “My trips”. If you leave without saving, the itinerary is not kept.' } },
  { id: 'trips-share', intent: 'saved_trips', links: [L.trips],
    q: ['chia sẻ lịch trình cho bạn bè', 'gửi link lịch trình', 'người khác xem lịch trình của mình được không'], test: 'cho bạn mình xem lịch trình kiểu gì',
    a: { vi: 'Trong “Chuyến đi của tôi” bấm Chia sẻ: lịch trình được bật công khai và bạn nhận liên kết để gửi. Người nhận xem được mà không cần tài khoản; bạn tắt chia sẻ bất cứ lúc nào.', en: 'In “My trips” press Share: the trip is made public and you get a link to send. Anyone with it can view without an account; you can turn sharing off at any time.' } },
  { id: 'trips-export', intent: 'saved_trips', links: [L.trips],
    q: ['xuất lịch trình ra excel', 'in lịch trình', 'tải lịch trình về máy', 'lưu lịch trình thành pdf'], test: 'có tải file lịch trình được không',
    a: { vi: 'Ở lịch trình (khi đã đăng nhập) có nút xuất Excel và PDF (in) — gồm từng ngày, giờ, địa điểm, địa chỉ, khoảng cách, khách sạn và tour.', en: 'The itinerary (when signed in) has Excel and PDF (print) export — every day, time, place, address, distance, hotel and tour.' } },
  { id: 'trips-live', intent: 'saved_trips', links: [L.trips],
    q: ['bắt đầu chuyến đi là gì', 'đi nhóm theo dõi nhau được không', 'dẫn đường trong chuyến đi', 'chuyến đi trực tiếp'], test: 'cả nhóm cùng xem lịch trình lúc đi được không',
    a: { vi: '“Bắt đầu chuyến đi” mở chế độ đi thật: cả nhóm cùng theo một lịch trình, thấy điểm tiếp theo và được dẫn đường tới đó.', en: '“Start the trip” opens live mode: the group follows one itinerary, sees the next stop and gets directions to it.' } },
  // — Explore, places —
  { id: 'explore-score', intent: 'find_food', links: [L.explore, L.help],
    q: ['điểm foodtrip là gì', 'điểm foodtrip khác đánh giá google thế nào', 'sao quán này không có điểm'], test: 'con số điểm ở mỗi quán nghĩa là gì',
    a: { vi: 'Đánh giá Google là của người dùng Google. Điểm FoodTrip là mức phù hợp, tổng hợp từ những tiêu chí đang có dữ liệu (đánh giá, khoảng cách, ngân sách, độ phổ biến); quán không đủ dữ liệu thì không có điểm, FoodTrip không tự đặt điểm.', en: 'Google ratings come from Google users. The FoodTrip score is a suitability guide built from the criteria that have data (ratings, distance, budget, popularity); a place without enough data gets no score — FoodTrip does not invent one.' } },
  { id: 'explore-nearby', intent: 'find_food', links: [L.nearby],
    q: ['tìm quán gần mình', 'ăn gì gần đây', 'vòng quay chọn món là gì', 'không biết ăn gì'], test: 'đói mà không biết ăn gì quanh đây',
    a: { vi: '“Ăn gì gần đây?” tìm quán quanh vị trí của bạn (cần cho phép vị trí) và có vòng quay chọn món ngẫu nhiên khi bạn chưa biết ăn gì.', en: '“Nearby” finds places around you (allow location) and has a food wheel for when you cannot decide.' } },
  { id: 'saved-places', intent: 'saved_trips', links: [L.saved],
    q: ['lưu quán yêu thích', 'địa điểm đã lưu ở đâu', 'không đăng nhập có lưu quán được không'], test: 'mình bấm lưu quán rồi giờ xem lại ở đâu',
    a: { vi: 'Bấm biểu tượng lưu ở quán; danh sách nằm ở mục “Đã lưu”. Chưa đăng nhập thì lưu trên máy này; đăng nhập để đồng bộ giữa các thiết bị.', en: 'Tap the save icon on a place; the list is under “Saved”. Signed out, it stays on this device; sign in to sync across devices.' } },
  { id: 'map-not-showing', intent: 'contact_support', links: [L.help, L.contact],
    q: ['bản đồ không hiện', 'tìm kiếm không ra gì', 'web bị lỗi không load bản đồ'], test: 'sao map trắng trơn vậy',
    a: { vi: 'Kiểm tra kết nối mạng và quyền vị trí của trình duyệt, rồi tải lại trang. Nếu vẫn lỗi, gửi lời nhắn ở trang Liên hệ kèm trang bạn đang mở.', en: 'Check your connection and the browser’s location permission, then reload. If it persists, send a message on the Contact page with the page you were on.' } },
  // — Sharing places from videos —
  { id: 'share-how', intent: 'share_video', links: [L.share],
    q: ['chia sẻ quán từ video thế nào', 'dán link tiktok ở đâu', 'đăng video review quán', 'tìm quán từ video'], test: 'mình có clip tiktok quán ngon muốn đăng lên',
    a: { vi: 'Vào “Chia sẻ quán”, dán link TikTok hoặc YouTube và bấm “Tìm quán từ video”: FoodTrip đọc tiêu đề, mô tả, lời nói, thẻ vị trí và bình luận để gợi ý quán. Chọn đúng quán, thêm cảm nhận rồi Đăng (cần đăng nhập).', en: 'Go to “Share a place”, paste a TikTok or YouTube link and press “Find places from video”: FoodTrip reads the title, description, speech, location tag and comments to suggest the place. Pick the right one, add a note and publish (sign in).' } },
  { id: 'share-not-found', intent: 'share_video', links: [L.share],
    q: ['sao dán link không ra quán', 'video không tìm được quán', 'bài ảnh tiktok không ra quán'], test: 'tìm quán từ video mà nó báo không nêu tên quán',
    a: { vi: 'FoodTrip chỉ gợi ý khi video thật sự nêu quán: trong caption, mô tả, lời nói, thẻ vị trí hay câu trả lời bình luận. Nếu tên quán chỉ nằm trên chữ trong ảnh/video thì chưa đọc được — hãy nhập tên quán và khu vực rồi bấm “Tìm địa điểm trên bản đồ”.', en: 'FoodTrip suggests a place only when the video names it — in the caption, description, speech, location tag or a comment answer. If the name is only written on the pictures, it cannot read it yet — type the name and area and search the map.' } },
  { id: 'share-links', intent: 'share_video', links: [L.share],
    q: ['link facebook có dùng được không', 'hỗ trợ những link nào', 'instagram reel có được không'], test: 'dán link fb được không',
    a: { vi: 'TikTok (video và bài ảnh) và YouTube được đọc tự động. Link Facebook và Instagram vẫn đăng được nhưng bạn tự nhập tên quán để tìm trên bản đồ.', en: 'TikTok (videos and photo posts) and YouTube are read automatically. Facebook and Instagram links can be shared, but you type the place name to find it on the map.' } },
  { id: 'share-multi-plan', intent: 'share_video', links: [L.share, L.trips],
    q: ['video có nhiều quán thì sao', 'video lịch trình có tạo kế hoạch được không', 'tạo lịch trình từ video'], test: 'clip food tour nhiều quán thì có lấy hết không',
    a: { vi: 'Video nhiều quán: FoodTrip tìm từng quán được nhắc và cho bạn “Chọn tất cả quán khớp tên”. Nếu video là lịch trình (Ngày 1, sáng, tối…), bạn tạo được kế hoạch giống vậy ngay ở trang Chia sẻ; kế hoạch lưu vào “Chuyến đi của tôi”.', en: 'For a video with many places, FoodTrip finds each one named and offers “Select the name matches”. If the video is an itinerary (Day 1, morning, evening…), you can create a plan like it on the Share page; it is saved to “My trips”.' } },
  { id: 'share-edit-delete', intent: 'share_video', links: [L.share],
    q: ['xoá bài chia sẻ quán', 'sửa bài chia sẻ', 'đăng nhầm quán'], test: 'mình muốn gỡ bài đã đăng',
    a: { vi: 'Ở “Chia sẻ quán” → “Bài của tôi”, mỗi bài có nút Sửa và Xóa (xoá không hoàn tác được).', en: 'In “Share a place” → “My posts”, each post has Edit and Delete (deleting cannot be undone).' } },
  // — Reviews —
  { id: 'review-when', intent: 'reviews', links: [L.bookings],
    q: ['viết đánh giá ở đâu', 'sao không đánh giá được', 'khi nào được đánh giá khách sạn', 'đánh giá tour sau khi đi'], test: 'mình ở xong rồi muốn review khách sạn',
    a: { vi: 'Trong “Đặt phòng của tôi”: đánh giá nơi ở sau khi trả phòng (đơn đã thanh toán), đánh giá tour sau khi tour kết thúc, trong vòng 180 ngày. Mỗi đơn một đánh giá, sửa lại được.', en: 'In “My bookings”: review a stay after check-out (paid bookings) or a tour after it ends, within 180 days. One review per booking; you can edit it.' } },
  { id: 'review-name-hidden', intent: 'reviews', links: [],
    q: ['đánh giá có hiện tên mình không', 'đánh giá bị ẩn', 'chủ khách sạn trả lời đánh giá được không'], test: 'người khác có thấy tên đầy đủ của mình không',
    a: { vi: 'Đánh giá hiện tên rút gọn như “Mai T.” kèm phòng/tháng hoặc ngày tour. Đối tác có thể phản hồi; FoodTrip chỉ ẩn đánh giá vi phạm và luôn ghi lý do.', en: 'Reviews show a short name like “Mai T.” with the room/month or tour date. Partners can reply; FoodTrip hides only reviews that break the rules, always with a reason.' } },
  // — Account —
  { id: 'account-signin', intent: 'account', links: [L.forgot],
    q: ['đăng ký tài khoản thế nào', 'không đăng nhập được', 'quên mật khẩu', 'đổi mật khẩu'], test: 'mình quên pass rồi',
    a: { vi: 'Bấm “Đăng nhập” trên thanh menu để đăng nhập hoặc tạo tài khoản. Quên mật khẩu: dùng “Quên mật khẩu” để nhận email đặt lại (kiểm tra cả thư rác).', en: 'Use “Sign in” in the menu to sign in or create an account. Forgot your password: use “Forgot password” to get a reset email (check spam too).' } },
  { id: 'account-needed', intent: 'account', links: [L.plan],
    q: ['có cần tài khoản để lên lịch không', 'không đăng nhập dùng được gì', 'tại sao phải đăng nhập'], test: 'chưa có tài khoản thì xài được không',
    a: { vi: 'Không cần tài khoản để khám phá quán và tạo lịch trình. Cần đăng nhập để lưu/chia sẻ lịch trình, đặt phòng, gửi yêu cầu tour, đăng bài chia sẻ quán và đồng bộ địa điểm đã lưu.', en: 'No account is needed to explore and plan. Sign in to save or share trips, book rooms, request tours, share places and sync saved places.' } },
  // — Partners —
  { id: 'partner-stay-signup', intent: 'partner', links: [L.partner],
    q: ['đăng ký làm đối tác khách sạn', 'mình có homestay muốn hợp tác', 'đăng bán phòng trên foodtrip', 'làm sao để khách sạn mình đặt được trên web'], test: 'nhà nghỉ của mình muốn lên foodtrip',
    a: { vi: 'Vào “Hợp tác với FoodTrip” → Đối tác lưu trú, đăng ký 4 bước: nơi ở (nhận nơi đã có trên bản đồ hoặc tự khai báo, ghim vị trí), liên hệ & giấy tờ, điều khoản đối tác, xác nhận. Sau khi FoodTrip duyệt, hoàn thành danh sách kiểm tra để bắt đầu nhận khách.', en: 'Go to “Partner with FoodTrip” → Stays and sign up in 4 steps: the property (claim one on the map or list your own with a pin), contact & papers, partner terms, confirm. Once FoodTrip approves, finish the checklist to start taking guests.' } },
  { id: 'partner-checklist', intent: 'partner', links: [L.partner],
    q: ['danh sách kiểm tra đối tác gồm gì', 'sao khách sạn mình chưa hiện cho khách', 'cần gì để mở bán phòng'], test: 'duyệt rồi mà chưa bán phòng được',
    a: { vi: 'Để mở bán: ít nhất 3 ảnh và mô tả từ 30 ký tự, ghim vị trí, tiện nghi, chính sách (giờ nhận/trả phòng, huỷ phòng), loại phòng và giá, tài khoản nhận tiền. Đủ thì bật bán phòng và nơi ở hiện cho khách.', en: 'To go live: at least 3 photos and a 30+ character description, a map pin, facilities, policies (check-in/out, cancellation), room types and rates, and a payout account. Then switch sales on and the place is shown to travellers.' } },
  { id: 'partner-papers', intent: 'partner', links: [L.partner],
    q: ['hồ sơ đối tác cần giấy tờ gì', 'có cần căn cước không', 'giấy phép kinh doanh có bắt buộc không'], test: 'đăng ký đối tác cần chuẩn bị gì',
    a: { vi: 'Nơi ở: tên, vai trò, số điện thoại người liên hệ; giấy phép kinh doanh và mã số thuế nếu có. Đơn vị tour: giấy phép lữ hành, giấy phép kinh doanh, thẻ hướng dẫn viên, mã số thuế. FoodTrip không yêu cầu ảnh căn cước.', en: 'Stays: the contact’s name, role and phone; business licence and tax code if you have them. Tour operators: travel licence, business licence, guide card, tax code. FoodTrip does not ask for ID photos.' } },
  { id: 'partner-commission', intent: 'partner', links: [L.partner],
    q: ['phí hoa hồng bao nhiêu', 'đối tác nhận tiền thế nào', 'bao lâu thì đối tác nhận được tiền'], test: 'foodtrip lấy bao nhiêu phần trăm',
    a: { vi: 'Mức hoa hồng và lịch nhận tiền ghi trong điều khoản đối tác bạn đồng ý khi đăng ký (ví dụ: nhận tiền sau một số ngày làm việc kể từ ngày khách trả phòng). FoodTrip đối soát theo từng đơn hoàn thành và chuyển phần còn lại sau hoa hồng vào tài khoản nhận tiền.', en: 'The commission and payout schedule are in the partner terms you accept at sign-up (e.g. paid a number of working days after check-out). FoodTrip settles per completed booking and pays the rest, net of commission, to your payout account.' } },
  { id: 'partner-tour-signup', intent: 'partner', links: [L.partner],
    q: ['công ty tour muốn đăng tour lên web', 'đăng ký đối tác tour', 'đăng tour thế nào'], test: 'mình làm du lịch muốn bán tour trên đây',
    a: { vi: 'Vào “Hợp tác với FoodTrip” → Đối tác tour, đăng ký 4 bước như đối tác lưu trú. Được duyệt rồi thì soạn tour: ảnh, tóm tắt, lịch trình, bao gồm, chính sách huỷ và ít nhất một ngày khởi hành để đăng.', en: 'Go to “Partner with FoodTrip” → Tours and sign up in 4 steps like stays. Once approved, write the tour — photos, summary, schedule, inclusions, cancellation policy and at least one departure — and publish.' } },
  // — Contact and the assistant —
  { id: 'contact', intent: 'contact_support', links: [L.contact],
    q: ['liên hệ hỗ trợ ở đâu', 'báo lỗi địa chỉ quán sai', 'gặp nhân viên', 'góp ý cho web'], test: 'thông tin quán trên web bị sai thì báo ở đâu',
    a: { vi: 'Gửi lời nhắn ở trang Liên hệ — báo lỗi dữ liệu, góp ý hay đề nghị hợp tác; FoodTrip trả lời qua email bạn để lại.', en: 'Send a message on the Contact page — data problems, suggestions or partnerships; FoodTrip replies to the email you leave.' } },
  { id: 'assistant-privacy', intent: 'out_of_scope', links: [],
    q: ['trợ lý có lưu tin nhắn không', 'bạn là ai', 'trợ lý này là gì'], test: 'bạn có phải chatgpt không',
    a: { vi: 'Mình là trợ lý của FoodTrip, giúp lên lịch ăn chơi và giải đáp cách dùng web. Mình dựa vào kiến thức FoodTrip và dữ liệu của web; khi được bật, dịch vụ mô hình AI giúp diễn đạt câu trả lời theo hội thoại. Tối đa 12 tin gần nhất có thể được gửi kèm để hiểu ngữ cảnh. Email và số điện thoại được lọc theo mẫu trước khi gửi cho mô hình; các thẻ đơn cá nhân không được gửi kèm. Câu hỏi hiện tại được lưu ẩn danh sau khi lọc email, số điện thoại để cải thiện trợ lý. Bạn nên tránh nhập thông tin nhạy cảm.', en: 'I’m FoodTrip’s assistant for food trips and using the site. I use FoodTrip knowledge and app data; when enabled, an AI service helps phrase conversational replies. Up to 12 recent messages may be included for context. Email and phone patterns are filtered before sending to the model; personal booking cards are excluded. The current question is stored anonymously with email and phone patterns filtered to improve the assistant. Please avoid sharing sensitive information.' } },
]

// — Finding the entry for a question, with words (the baseline the trained retriever replaces) —

const STOP = new Set(['minh', 'ban', 'em', 'anh', 'chi', 'oi', 'ad', 'shop', 'a', 'nha', 'nhe', 'vay', 'the', 'thi', 'la', 'co', 'khong', 'ko', 'duoc', 'dc', 'cho', 'hoi', 'voi', 'cua', 'o', 'nao', 'gi', 'sao', 'nhu', 'kieu', 'roi', 'ma', 'va', 'de', 'muon'])
const words = (s) => plain(s).split(' ').filter((w) => w && !STOP.has(w))
const grams = (ws) => [...ws, ...ws.slice(1).map((w, i) => `${ws[i]} ${w}`)]

let index = null
function build(entries) {
  const docs = entries.map((e) => ({ e, sets: [...e.q, e.a.vi].map((t) => new Set(grams(words(t)))) }))
  const df = new Map()
  for (const d of docs) for (const g of new Set(d.sets.flatMap((s) => [...s]))) df.set(g, (df.get(g) ?? 0) + 1)
  const idf = (g) => Math.log(1 + docs.length / (df.get(g) ?? 0.5))
  return { docs, idf }
}

/**
 * The FAQ entries closest to a question by shared words (accent-blind, with
 * word pairs), best first: [{ id, score }], score 0–1. `entries` defaults to FAQ.
 */
export function faqRetrieve(question, { entries = FAQ, top = 3 } = {}) {
  if (entries === FAQ) index ??= build(FAQ)
  const { docs, idf } = entries === FAQ ? index : build(entries)
  const query = new Set(grams(words(question)))
  if (!query.size) return []
  const qWeight = [...query].reduce((s, g) => s + idf(g), 0)
  return docs.map(({ e, sets }) => {
    let best = 0
    for (const set of sets) {
      let shared = 0, setWeight = 0
      for (const g of set) setWeight += idf(g)
      for (const g of query) if (set.has(g)) shared += idf(g)
      // Dice over weighted grams: both how much of the question and of the phrasing matched.
      best = Math.max(best, (2 * shared) / (qWeight + setWeight || 1))
    }
    return { id: e.id, score: Math.round(best * 1000) / 1000 }
  }).sort((a, b) => b.score - a.score).slice(0, top)
}

export const faqById = (id) => FAQ.find((e) => e.id === id) ?? null
