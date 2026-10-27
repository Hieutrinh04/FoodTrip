// The assistant's rule baseline: which intent a message has, from keywords.
// Used when the trained model (ml/assistant) is not deployed, answers too
// slowly or is unsure — and as the bar the model has to beat (see
// scripts/eval-assistant.js). Plain JS, shared by Deno, the browser and Node.

import { plain } from '../placeNames.js'

// Each intent's phrases (accents off) and how much one of them counts.
const PATTERNS = [
  ['booking_cancel_refund', 3, /\b(huy|hoan tien|hoan lai|refund|cancel|tra phong som|doi y)\b/],
  ['booking_payment', 3, /\b(thanh toan|chuyen khoan|vnpay|sepay|quet ma|qr|tra tien|tien coc|dat coc|giu phong|het han thanh toan)\b/],
  ['booking_status', 2, /\b(don (cua toi|dat|phong)|tinh trang|trang thai|xac nhan chua|da xac nhan|kiem tra don|thong bao)\b/],
  ['booking_how', 2, /\b(dat phong|dat khach san|book|booking|dat cho o|dat homestay|o dau|khach san nao)\b/],
  ['tour_info', 3, /\b(tour|hdv|huong dan vien|tour guide|giu cho tour)\b/],
  ['share_video', 3, /\b(chia se (quan|video)|dan link|link tiktok|link youtube|video review|dang video|tiktok|youtube)\b/],
  ['saved_trips', 2, /\b(luu lich trinh|luu chuyen|chia se lich trinh|xuat (file|excel|pdf)|chuyen di cua toi|bat dau chuyen di|link lich trinh)\b/],
  ['reviews', 3, /\b(danh gia|review cho|viet nhan xet|cham diem khach san|nhan xet)\b/],
  ['account', 3, /\b(dang nhap|dang ky|tai khoan|mat khau|quen pass|doi pass|email xac nhan|log ?in|sign ?up)\b/],
  ['partner', 4, /\b(hop tac|doi tac|dang ky (khach san|homestay|tour)|chu khach san|kinh doanh|dang ban phong|nha cung cap)\b/],
  ['contact_support', 2, /\b(lien he|hotline|ho tro|bao loi|gop y|cskh|cham soc khach hang)\b/],
  ['modify_plan', 3, /\b(doi (quan|cho|diem|gio|thu tu)|thay (quan|diem|cho)|them (1|mot|\d+) ngay|bot (1|mot|\d+) ngay|sua lich|chinh lich|bo diem|xoa diem)\b/],
  ['estimate_cost', 4, /\b(het bao nhieu|ton bao nhieu|chi phi|kinh phi|bao nhieu tien|co du khong|du khong|co du|co du khong|ton kem|du tru|mang bao nhieu|uoc tinh|tong cong)\b/],
  ['ask_weather', 4, /\b(thoi tiet|co mua|mua khong|mua nhieu|nang hay mua|lanh khong|nong khong|nhiet do|du bao|ao mua|troi (dep|mua|nang))\b/],
  ['place_info', 3, /\b(may gio mo cua|gio mo cua|mo cua (luc|may)|dia chi|so dien thoai|may sao|co dong khong|con mo khong|thong tin quan|co ngon khong)\b/],
  ['find_food', 2,/\b(an gi|quan (ngon|an)|gan day|gan toi|goi y quan|tim quan|o dau ngon|mon gi)\b/],
  ['plan_trip', 2, /\b(lich trinh|len lich|ke hoach|du lich|di choi|chuyen di|\d+\s*n\s*\d+\s*d|\d+\s*ngay|cuoi tuan|ngan sach|\d+\s*(trieu|tr|k)\b)/],
  ['greeting', 2, /^(xin chao|chao|hello|hi|alo|hey|chao ban|chao shop)\b/],
  ['thanks', 2, /\b(cam on|thank|thanks|tam biet|bye|ok cam on)\b/],
]

/**
 * @returns {{ intent: string, confidence: number, source: 'rules' }} — confidence
 *          is how far the best intent is ahead (0.3 when nothing matched).
 */
export function ruleIntent(message) {
  const t = plain(message)
  if (!t) return { intent: 'out_of_scope', confidence: 0.3, source: 'rules' }
  const score = {}
  for (const [intent, weight, re] of PATTERNS) {
    const hits = t.match(new RegExp(re.source, 'g'))?.length ?? 0
    if (hits) score[intent] = (score[intent] ?? 0) + weight * hits
  }
  // A question about money while planning ("lịch trình 3 triệu") is planning, not payment.
  if (score.plan_trip && score.booking_payment && !/thanh toan|chuyen khoan|vnpay|sepay/.test(t)) delete score.booking_payment
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1])
  if (!ranked.length) return { intent: 'out_of_scope', confidence: 0.3, source: 'rules' }
  const [best, top] = ranked[0]
  const second = ranked[1]?.[1] ?? 0
  return { intent: best, confidence: Math.min(0.95, 0.5 + (top - second) / (top + 2)), source: 'rules' }
}
