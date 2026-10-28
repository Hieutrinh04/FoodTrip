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
  ['partner', 4, /\b(hop tac|doi tac|duoc duyet|xet duyet|duyet ho so|dang ky (khach san|homestay|tour)|chu khach san|kinh doanh|dang ban phong|nha cung cap)\b/],
  ['contact_support', 2, /\b(lien he|hotline|ho tro|bao loi|gop y|cskh|cham soc khach hang)\b/],
  ['modify_plan', 3, /\b(doi (quan|cho|diem|gio|thu tu)|thay (quan|diem|cho)|them (1|mot|\d+) ngay|bot (1|mot|\d+) ngay|sua lich|chinh lich|bo diem|xoa diem)\b/],
  ['estimate_cost', 4, /\b(het bao nhieu|ton bao nhieu|chi phi|kinh phi|bao nhieu tien|co du khong|du khong|co du|co du khong|ton kem|du tru|mang bao nhieu|uoc tinh|tong cong)\b/],
  ['ask_weather', 4, /\b(thoi tiet|co mua|mua khong|mua nhieu|nang hay mua|lanh khong|nong khong|nhiet do|du bao|ao mua|troi (dep|mua|nang))\b/],
  ['place_info', 3, /\b(may gio mo cua|gio mo cua|mo cua (luc|may)|dia chi|so dien thoai|may sao|co dong khong|con mo khong|thong tin quan|co ngon khong)\b/],
  ['find_food', 2, /\b(an gi|quan (ngon|an|cafe|ca phe)|quan [a-z]+( [a-z]+)? ngon|[a-z]+ ngon (o|tai|nhat)|gan day|gan toi|goi y (vai |cac |mot so )?quan|tim quan|(?:liet ke|danh sach|de xuat|goi y) (?:cac |nhung |vai |mot so )?(?:quan|nha hang|cho an)|nha hang (ngon|o|tai)|o dau ngon|mon gi)\b/],
  ['plan_trip', 2, /\b(lich trinh|len lich|ke hoach|du lich|di choi|chuyen di|muon (di|ghe)|dinh di|tu van du lich|\d+\s*n\s*\d+\s*d|\d+\s*ngay|cuoi tuan|ngan sach|\d+\s*(trieu|tr|k)\b)/],
  ['greeting', 2, /^(xin chao|chao|hello|hi|alo|hey|chao ban|chao shop)\b/],
  ['thanks', 2, /\b(cam on|thank|thanks|tam biet|bye|ok cam on)\b/],
]

/** "địa chỉ ăn ngon" means recommendations; "địa chỉ Phở Thìn" means one place.
 * Interpret the food request as a phrase before scoring isolated words like địa chỉ.
 */
export function isFoodDiscovery(message) {
  const t = plain(message)
  // "An" alone also occurs in Hội An; require a food noun or eating phrase.
  const food = /\b(quan|nha hang|an (?:gi|uong|ngon|o dau)|cho an|am thuc|cafe|ca phe|food|restaurant|eat)\b/.test(t)
  if (/\b(len lich|lap (?:lich trinh|ke hoach)|tao lich trinh)\b/.test(t)) return false
  const collection = /\b(cac|nhung|vai|mot so|danh sach|liet ke|goi y|de xuat|recommend|list|suggest)\b/.test(t)
  const generic = /\b((?:dia chi|dia diem|diem|cho|quan|nha hang) (?:de |nen )?(?:an|am thuc|ngon)|an (?:gi|o dau|ngon|uong)|where to eat)\b/.test(t)
  const namedFact = /\b(dia chi (?:cua|chinh xac)|so dien thoai|gio mo cua|may gio|mo cua luc|co ngon khong|con mo khong|phone number|opening hours)\b/.test(t)
  return food && !namedFact && (collection || generic)
}

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
  if (isFoodDiscovery(message)) {
    score.find_food = Math.max(score.find_food ?? 0, 4)
    // A list of food addresses is a search, not a request to name one restaurant.
    delete score.place_info
    if (!/\b(khach san|homestay|dat phong|hotel|booking)\b/.test(t)) delete score.booking_how
  }
  // A question about money while planning ("lịch trình 3 triệu") is planning, not payment.
  if (score.plan_trip && score.booking_payment && !/thanh toan|chuyen khoan|vnpay|sepay/.test(t)) delete score.booking_payment
  // Paying for a tour is about tours (they are not paid on the site), not room payment.
  if (score.tour_info && score.booking_payment && !/phong|khach san|homestay/.test(t)) delete score.booking_payment
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1])
  if (!ranked.length) return { intent: 'out_of_scope', confidence: 0.3, source: 'rules' }
  const [best, top] = ranked[0]
  const second = ranked[1]?.[1] ?? 0
  return { intent: best, confidence: Math.min(0.95, 0.5 + (top - second) / (top + 2)), source: 'rules' }
}
