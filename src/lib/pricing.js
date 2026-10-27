// Local dataset only tracks a coarse 0-2 price tier per place — map that to a
// realistic per-person VND range for display/export, instead of just "đ" symbols.
const PRICE_RANGES = {
  0: { vi: 'Miễn phí', en: 'Free' },
  1: { vi: '20.000đ – 60.000đ', en: '20,000–60,000₫' },
  2: { vi: '100.000đ – 300.000đ', en: '100,000–300,000₫' },
}

/**
 * Whether a place is from FoodTrip's own curated dataset, whose price tier,
 * rating and hours were written for it. Places found by a live search (Google
 * via Serper: `source`; Track-Asia for a custom destination: city 'custom')
 * carry placeholders there instead — Serper publishes no price for Vietnamese
 * venues, Track-Asia no price, rating or hours.
 */
export function isCuratedPlace(place) {
  return Boolean(place) && !place.source && place.city !== 'custom'
}

/**
 * The price to show for a place on a trip: the curated tier's range, Google's
 * own wording when it gave one, or plainly unknown — never a made-up range.
 * `known` says whether there is a price at all, for styling.
 */
export function placePrice(place, lang) {
  if (place?.priceLevel) return { label: place.priceLevel, known: true }
  if (isCuratedPlace(place) && PRICE_RANGES[place.price]) return { label: PRICE_RANGES[place.price][lang], known: true }
  return { label: lang === 'vi' ? 'Chưa có giá' : 'Price unknown', known: false }
}

/** Closing time when it is known (curated, or Google's opening hours), else null. */
export function knownClosingTime(place) {
  if (!place?.hours?.close) return null
  return isCuratedPlace(place) || place.weeklyHours?.length ? place.hours.close : null
}
