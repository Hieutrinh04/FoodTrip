import { normalizeVi } from './text.js'

/** Explicit dining requirements only; trip budgets are not meal prices. */
export function foodPreferencePatch(message) {
  const t = normalizeVi(message)
  const raw = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
  const patch = {}
  if (/\b(?:an chay|quan chay|do chay|vegetarian|vegan)\b/.test(t)) patch.kind = 'vegetarian'
  else if (/\b(?:ca phe|cafe|coffee)\b/.test(t)) patch.kind = 'cafe'
  if (/\b(?:khong (?:muon |can )?an chay|khong can chay|bo loc chay|not vegetarian)\b/.test(t)) patch.kind = 'food'
  const rating = raw.match(/(?:tu|tren|it nhat|toi thieu|>=?|at least|over|above)\s*(\d(?:[.,]\d)?)\s*(?:sao|stars?)/)
  if (rating) {
    const value = Number(rating[1].replace(',', '.'))
    if (value >= 1 && value <= 5) { patch.minRating = value; patch.ratingExclusive = /^(?:tren|over|above|>)(?![=])/.test(rating[0]) }
  }
  if (/\b(?:bo loc sao|khong can loc sao|any rating)\b/.test(t)) { patch.minRating = null; patch.ratingExclusive = false }
  const reviews = raw.match(/(?:it nhat|toi thieu|tu|at least)\s*(\d{1,6})\s*(?:luot (?:danh gia|review)|danh gia|reviews?)/)
  if (reviews) patch.minReviews = Number(reviews[1])
  if (/\b(?:bo loc danh gia|any review count)\b/.test(t)) patch.minReviews = null
  const budget = raw.match(/(?:duoi|khong qua|toi da|under|up to|budget)\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|vnd|dong|d)(?:\b|$)/)
  if (budget) {
    const value = Number(budget[1].replace(',', '.')) * (/^(k|nghin|ngan)$/.test(budget[2]) ? 1000 : 1)
    if (value > 0 && value <= 10000000) patch.mealBudget = value
  }
  if (/\b(?:bo ngan sach|khong gioi han gia|no budget limit)\b/.test(t)) patch.mealBudget = null
  if (/\b(?:dang mo cua|mo ngay bay gio|open now)\b/.test(t)) patch.openNow = true
  if (/\b(?:khong can dang mo|bo loc mo cua|any opening hours)\b/.test(t)) patch.openNow = false
  return patch
}

export function mergeFoodPreferences(message, before = {}) {
  return { ...before, ...foodPreferencePatch(message) }
}

export function matchesFoodPreferences(place, preferences) {
  if (preferences.minRating != null && (place.googleRating == null || (preferences.ratingExclusive ? place.googleRating <= preferences.minRating : place.googleRating < preferences.minRating))) return false
  if (preferences.minReviews != null && (place.googleRatingCount == null || place.googleRatingCount < preferences.minReviews)) return false
  if (preferences.kind === 'cafe' && place.category !== 'cafe') return false
  if (preferences.kind === 'vegetarian') {
    const description = normalizeVi(`${place.name?.vi ?? ''} ${place.shortDesc?.vi ?? ''}`)
    if (!/\b(?:chay|vegetarian|vegan)\b/.test(description) || /\b(?:khong chay|non vegetarian)\b/.test(description)) return false
  }
  return true
}

export function foodPreferenceNotes(preferences, lang = 'vi') {
  const vi = lang === 'vi'
  const filters = []
  if (preferences.kind === 'cafe') filters.push(vi ? 'quán cà phê' : 'cafes')
  if (preferences.kind === 'vegetarian') filters.push(vi ? 'quán có thông tin ăn chay' : 'places described as vegetarian')
  if (preferences.minRating != null) filters.push(`${preferences.ratingExclusive ? '>' : '≥'} ${preferences.minRating}/5`)
  if (preferences.minReviews != null) filters.push(`${vi ? 'ít nhất' : 'at least'} ${preferences.minReviews} ${vi ? 'lượt đánh giá' : 'ratings'}`)
  const notes = filters.length ? [`${vi ? 'Tiêu chí đã áp dụng' : 'Applied filters'}: ${filters.join(' · ')}.`] : []
  if (preferences.mealBudget) notes.push(vi ? `Bạn muốn tối đa ${preferences.mealBudget.toLocaleString('vi-VN')}đ/người cho bữa ăn. Mình chưa có giá thực đơn đã xác minh, nên kết quả tìm kiếm chưa được xác nhận nằm trong mức này.` : `Your meal budget is ${preferences.mealBudget.toLocaleString('en-US')} VND per person. Verified menu prices are unavailable, so these places are not confirmed to fit that budget.`)
  if (preferences.openNow) notes.push(vi ? 'Mình chưa xác minh trạng thái mở cửa ngay lúc này; mở chi tiết quán để kiểm tra giờ và liên hệ trước khi đến.' : 'Current opening status is unverified; check place details and contact the venue before visiting.')
  if (preferences.kind === 'vegetarian') notes.push(vi ? 'Thông tin ăn chay dựa trên tên/mô tả quán; hãy xác nhận thành phần và cách chế biến với quán.' : 'Vegetarian matching uses venue names/descriptions; confirm ingredients and preparation with the venue.')
  return notes
}
