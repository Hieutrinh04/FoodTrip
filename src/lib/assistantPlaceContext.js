import { normalizeVi } from './text.js'
import { CITIES } from '../data/destinations.js'
import { foodPreferencePatch, mergeFoodPreferences } from './assistantFoodPreferences.js'

const ORDINAL = { mot: 1, nhat: 1, dau: 1, hai: 2, ba: 3, tu: 4, bon: 4, nam: 5 }

/** Resolve references only against the latest place-bearing answer. Never guess a restaurant. */
export function placeFollowUp(message, messages) {
  const t = normalizeVi(message)
  if (/\b(?:lich trinh|chuyen di moi|bat dau lai|new trip|itinerary|thoi tiet|weather|dat phong|huy phong|hoan tien|thanh toan|booking|refund|tour|khach san|tai khoan|mat khau|ho tro|support)\b/.test(t)) return null
  const anchorIndex = messages.findLastIndex((m) => m.from === 'bot' && (m.foodSearch || m.places?.length))
  const anchor = messages[anchorIndex]
  const last = messages.slice(Math.max(0, anchorIndex)).reverse().find((m) => m.from === 'bot' && (m.places?.length || m.focusPlace))
  const places = anchor ? anchor.places ?? [] : (last?.focusPlace ? [last.focusPlace] : [])
  const search = [...messages].reverse().find((m) => m.from === 'bot' && m.foodSearch)
  const recent = [...messages].reverse().find((m) => m.from === 'bot')
  const inFoodTopic = !recent?.intent || ['find_food', 'place_info', 'clarify'].includes(recent.intent)
  if (search && inFoodTopic && !/\b(?:quan|place) (?:thu |so )?(?:\d+|mot|hai|ba|nhat|dau|first|second|third)\b/.test(t)) {
    const patch = foodPreferencePatch(message)
    const city = CITIES.find((c) => [c.name.vi, c.name.en, ...(c.id === 'hcmc' ? ['Sài Gòn', 'TPHCM', 'HCMC', 'Hồ Chí Minh'] : [])].some((name) => ` ${t} `.includes(` ${normalizeVi(name)} `)))
    const locationFollow = /^(?:con |o |tai |doi sang |chuyen sang |what about |in )/.test(t) && city && !/\bquan khac\b/.test(t)
    if (Object.keys(patch).length || locationFollow) {
      const kindChanged = patch.kind && patch.kind !== search.foodSearch.preferences?.kind
      const source = search.foodSearch
      const preferences = mergeFoodPreferences(message, source.preferences ?? mergeFoodPreferences(source.message))
      return { type: 'refine', search: {
        ...source, preferences,
        ...(kindChanged ? { message: patch.kind === 'cafe' ? 'tìm quán cà phê' : patch.kind === 'vegetarian' ? 'tìm quán chay' : 'tìm quán ăn', slots: [] } : {}),
        ...(city ? { trip: { ...source.trip, cityId: city.id, destinationQuery: null } } : {}),
      } }
    }
  }
  if (/\b(so sanh|quan nao (?:tot|ngon|nen|re)|compare (?:these|the) places)\b/.test(t) && places.length > 1
    && !/\b(o|tai|in|near)\s+/.test(t)) return { type: 'compare', places }
  if ((/^(?:con |cho (?:minh|toi) |tim |goi y |xem )*(?:quan khac|them quan|them vai quan|them dia chi)(?: (?:khong|nua|di|nhe|duoc khong))*$/.test(t) || t === 'more places') && search && inFoodTopic) {
    const excludeIds = [...new Set(messages.flatMap((m) => m.places?.map((p) => p.id) ?? []))]
    return { type: 'more', search: search.foodSearch, excludeIds }
  }
  const english = t.match(/\b(first|second|third) place\b/)
  const m = t.match(/\b(?:quan|cho|dia diem) (?:thu |so )?(\d+|mot|nhat|dau|hai|ba|tu|bon|nam)\b/)
  const ordinal = m ? (Number(m[1]) || ORDINAL[m[1]]) : english ? { first: 1, second: 2, third: 3 }[english[1]] : null
  const pronoun = /\b(quan (?:do|nay|ay)|cho do)\b/.test(t)
  const detail = /\b(dia chi|o dau|mo cua|may gio|dien thoai|thong tin|chi tiet)\b/.test(t)
  const assessment = /\b(danh gia|nhan xet|nen (?:di|an|ghe)|co ngon|co tot|review|phan tich)\b/.test(t)
  const reference = ordinal != null || pronoun
  if (!reference) return null
  if (!places.length) return { type: 'clarify', places: [], text: 'Mình chưa có danh sách quán để xác định số thứ tự. Bạn cho mình tên quán hoặc thành phố muốn tìm nhé.' }
  const place = ordinal != null ? places[ordinal - 1] : last?.focusPlace ?? (places.length === 1 ? places[0] : null)
  if (!place) return { type: 'clarify', places, text: ordinal != null
    ? `Danh sách vừa rồi có ${places.length} quán. Bạn muốn hỏi quán số mấy?`
    : 'Bạn muốn hỏi quán nào trong danh sách? Bạn có thể nói “quán thứ hai”.' }
  return { type: assessment ? 'assessment' : detail ? 'details' : 'details', place }
}

export function comparePlaces(places, lang = 'vi') {
  const vi = lang === 'vi'
  const lines = places.map((p, i) => `${i + 1}. ${p.name.vi}: ${p.googleRating != null ? `${p.googleRating}/5` : (vi ? 'chưa có điểm' : 'unrated')}${p.googleRatingCount ? ` · ${p.googleRatingCount.toLocaleString(vi ? 'vi-VN' : 'en-US')} ${vi ? 'lượt đánh giá' : 'ratings'}` : ''}`)
  return { text: [vi ? 'So sánh theo dữ liệu đang có:' : 'Comparison using available data:', ...lines,
    vi ? 'Điểm cao với nhiều lượt đánh giá là tín hiệu tham khảo tốt hơn điểm cao chỉ từ vài lượt. Mình chưa có giá món đã xác minh hay sở thích cụ thể của bạn để kết luận quán nào rẻ hơn hoặc hợp khẩu vị nhất. Bạn có thể chọn một quán để mình đọc kỹ nhận xét.' : 'A high score backed by many ratings is stronger evidence than a high score from a handful. Verified menu prices and your preferences are missing, so I cannot establish which is cheaper or best for your taste. Choose a place to inspect its reviews.'].join('\n\n'), links: [] }
}

export function nextQuestions(answer, lang = 'vi') {
  if (answer.places?.length) return lang === 'vi'
    ? ['Đánh giá quán thứ nhất', 'Địa chỉ quán thứ hai', 'Còn quán khác không?'].filter((_, i) => i !== 1 || answer.places.length > 1)
    : ['Review the first place', 'More places']
  if (answer.plan) return lang === 'vi' ? ['Chi phí khoảng bao nhiêu?', 'Tìm quán ăn ở đó', 'Thời tiết thế nào?'] : []
  return []
}
