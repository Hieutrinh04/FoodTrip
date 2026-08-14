const CRITERIA = ['food', 'value', 'service', 'space', 'hygiene']

export const FOODTRIP_CRITERIA = {
  food: { vi: 'Món ăn', en: 'Food' },
  value: { vi: 'Đáng tiền', en: 'Value' },
  service: { vi: 'Phục vụ', en: 'Service' },
  space: { vi: 'Không gian', en: 'Ambience' },
  hygiene: { vi: 'Vệ sinh', en: 'Hygiene' },
}

function stableOffset(id, salt) {
  let hash = salt * 97
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ((hash % 9) - 4) / 10
}

function clampScore(value) {
  return Math.max(3.2, Math.min(5, Math.round(value * 10) / 10))
}

/**
 * Produces a stable FoodTrip scorecard for the curated demo dataset. In the
 * production schema these values map directly to review_scores aggregates.
 */
export function getFoodTripScore(place) {
  const base = place.rating ?? 4.2
  const isFood = place.category === 'food' || place.category === 'cafe'
  const values = {
    food: clampScore(base + (isFood ? 0.1 : -0.15) + stableOffset(place.id, 1)),
    value: clampScore(base + (place.price <= 1 ? 0.25 : place.price >= 3 ? -0.2 : 0) + stableOffset(place.id, 2)),
    service: clampScore(base + stableOffset(place.id, 3)),
    space: clampScore(base + (place.tags?.some((tag) => ['nature', 'beach', 'oldtown'].includes(tag)) ? 0.2 : 0) + stableOffset(place.id, 4)),
    hygiene: clampScore(base + 0.05 + stableOffset(place.id, 5)),
  }
  const overall = clampScore(CRITERIA.reduce((sum, key) => sum + values[key], 0) / CRITERIA.length)
  return { overall, ...values }
}

export function scoreForCriterion(place, criterion = 'overall') {
  return getFoodTripScore(place)[criterion] ?? getFoodTripScore(place).overall
}
