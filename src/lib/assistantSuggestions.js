// What the assistant offers to ask on each page: the questions people on that
// page are most likely to have. Each one is read correctly by the rules alone
// (test/assistant.test.js), so they work before the trained model is online.

const PAGES = [
  { match: /^\/(bookings|pay|booking)/, vi: ['Đơn đặt phòng của tôi thế nào rồi?', 'Huỷ phòng bây giờ được hoàn bao nhiêu?', 'Mình cần thanh toán đơn nào?', 'Chuyển khoản rồi mà chưa thấy xác nhận?'],
    en: ['What is the status of my booking?', 'How much is refunded if I cancel now?', 'Which booking do I need to pay?', 'I transferred but it is not confirmed'] },
  { match: /^\/share/, vi: ['Chia sẻ quán từ video TikTok thế nào?', 'Video có nhiều quán thì sao?', 'Link Facebook có dùng được không?'],
    en: ['How do I share a place from a TikTok video?', 'What if the video has several places?', 'Can I use a Facebook link?'] },
  { match: /^\/(plan|trips|trip|live)/, vi: ['Lên lịch 2 ngày ở Đà Lạt, 2 người, 3 triệu', 'Đi Hội An 3 ngày 2 người hết bao nhiêu?', 'Đổi quán trong lịch trình thế nào?', 'Thời tiết Đà Lạt cuối tuần này'],
    en: ['Plan 2 days in Da Lat, 2 people, 3 million', 'How much for 3 days in Hoi An for 2?', 'How do I swap a place in my trip?', 'Weather in Da Lat this weekend'] },
  { match: /^\/(tour|tours)/, vi: ['Tour của tôi đã được xác nhận chưa?', 'Đặt tour thanh toán thế nào?', 'Lên lịch Đà Nẵng 3 ngày có tour'],
    en: ['Is my tour confirmed?', 'How do I pay for a tour?', 'Plan 3 days in Da Nang with a tour'] },
  { match: /^\/(hop-tac|partner|tour-partner)/, vi: ['Khách sạn đăng ký làm đối tác thế nào?', 'Đơn vị tour hợp tác với FoodTrip ra sao?', 'Đối tác cần chuẩn bị giấy tờ gì?'],
    en: ['How does a hotel become a partner?', 'How can a tour operator join?', 'What papers does a partner need?'] },
  { match: /^\/(explore|nearby|place|saved)/, vi: ['Quán phở ngon ở Hà Nội', 'Ăn gì ở Đà Lạt?', 'Phở Thìn Lò Đúc mấy giờ mở cửa?'],
    en: ['Good phở in Hanoi', 'What to eat in Da Lat?', 'When does Phở Thìn Lò Đúc open?'] },
]
const HOME = {
  vi: ['Lên lịch 2 ngày ở Đà Lạt, 2 người, 3 triệu', 'Đi Hội An 3 ngày 2 người hết bao nhiêu?', 'Quán phở ngon ở Hà Nội', 'Huỷ phòng có được hoàn tiền không?'],
  en: ['Plan 2 days in Da Lat, 2 people, 3 million', 'How much for 3 days in Hoi An for 2?', 'Good phở in Hanoi', 'Can I get a refund if I cancel?'],
}

/** The questions to offer on a page (its pathname). */
export function suggestionsFor(pathname, lang = 'vi') {
  return PAGES.find((p) => p.match.test(pathname ?? ''))?.[lang] ?? HOME[lang]
}

export const ALL_SUGGESTIONS = { pages: PAGES, home: HOME }
