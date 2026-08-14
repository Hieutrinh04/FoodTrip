import { hasMapsKey, searchPlaces, lookupPlace, placeMapUrl } from './trackAsia.js'

const PRICE_LEVEL_ORDER = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
]

// Track-Asia exposes no price level for a venue (Google Places did). Room
// rates were already simulated deterministically from the hotel id in
// roomTypes.js, so the price *band* is now derived the same way: same hotel
// always lands in the same band, but it is an estimate for demonstration —
// not a real tariff. Anything user-facing must present it as indicative only.
const SIMULATED_BANDS = ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE']

function simulatedPriceLevel(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return SIMULATED_BANDS[h % SIMULATED_BANDS.length]
}

function mapHotel(p) {
  return {
    id: p.id,
    name: p.name,
    // No ratings, review counts or photos exist in Track-Asia's data.
    rating: null,
    userRatingCount: null,
    address: p.address,
    location: p.location,
    mapsUri: placeMapUrl(p),
    priceLevel: p.id ? simulatedPriceLevel(p.id) : null,
    photoUrl: null,
  }
}

// Rough mapping from the trip's per-person daily budget to a price band, used
// to rank/group results — not to filter them out, since a sparse area may
// only have one or two lodging options at all.
function preferredPriceLevels(budgetPerPersonPerDay) {
  if (budgetPerPersonPerDay >= 1200000) return ['PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE']
  if (budgetPerPersonPerDay >= 600000) return ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE']
  return ['PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE']
}

/**
 * Finds real hotels in a destination city via Track-Asia text search — used up
 * front in the planner (right after budget is entered, before an itinerary's
 * stops exist), so it's scoped by city name. Returns null when no API key is
 * configured so the caller can show its no-key state.
 */
export async function searchHotelsForCity({ cityName, budgetPerPersonPerDay = 0, maxResultCount = 9 }) {
  if (!hasMapsKey || !cityName?.trim()) return null

  const results = await searchPlaces(`khách sạn ở ${cityName.trim()}`, { limit: maxResultCount })
  if (results === null) return null

  const preferred = preferredPriceLevels(budgetPerPersonPerDay)
  return results.map(mapHotel).sort((a, b) => {
    const aFit = a.priceLevel && preferred.includes(a.priceLevel) ? 1 : 0
    const bFit = b.priceLevel && preferred.includes(b.priceLevel) ? 1 : 0
    return bFit - aFit
  })
}

/**
 * Buckets hotel results into 3 groups relative to the trip's budget, so the
 * planner can show "trong tầm giá / tiết kiệm hơn / cao cấp hơn" instead of one
 * flat list. Hotels with no price band are grouped as "match" (unknown price
 * shouldn't read as "too expensive").
 */
export function groupHotelsByBudgetTier(hotels, budgetPerPersonPerDay) {
  const preferred = preferredPriceLevels(budgetPerPersonPerDay).map((l) => PRICE_LEVEL_ORDER.indexOf(l))
  const minIdx = Math.min(...preferred)
  const maxIdx = Math.max(...preferred)

  const groups = { value: [], match: [], premium: [] }
  for (const hotel of hotels) {
    const idx = hotel.priceLevel ? PRICE_LEVEL_ORDER.indexOf(hotel.priceLevel) : -1
    if (idx === -1) groups.match.push(hotel)
    else if (idx < minIdx) groups.value.push(hotel)
    else if (idx > maxIdx) groups.premium.push(hotel)
    else groups.match.push(hotel)
  }
  return groups
}

/**
 * Re-fetches a single hotel by its Track-Asia place id — used to land directly
 * on a booking page (e.g. a bookmarked `/booking/:placeId` link) without the
 * planner's in-memory hotel list still being around.
 */
export async function fetchHotelById(placeId) {
  if (!hasMapsKey || !placeId) return null
  const place = await lookupPlace(placeId)
  return place ? mapHotel(place) : null
}

export const PRICE_LEVEL_LABEL = {
  PRICE_LEVEL_FREE: { vi: 'Miễn phí', en: 'Free' },
  PRICE_LEVEL_INEXPENSIVE: { vi: 'Giá rẻ (ước tính)', en: 'Budget (est.)' },
  PRICE_LEVEL_MODERATE: { vi: 'Vừa phải (ước tính)', en: 'Moderate (est.)' },
  PRICE_LEVEL_EXPENSIVE: { vi: 'Cao cấp (ước tính)', en: 'Upscale (est.)' },
  PRICE_LEVEL_VERY_EXPENSIVE: { vi: 'Sang trọng (ước tính)', en: 'Luxury (est.)' },
}

export function hotelMapsUrl(hotel) {
  return hotel.mapsUri ?? placeMapUrl(hotel)
}

// Deterministic accent-gradient pick for a hotel's placeholder card art —
// the only card visual available now that no photos come back from the API.
const CARD_ACCENTS = ['chili', 'lantern', 'herb']

export function hotelCardAccent(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CARD_ACCENTS[h % CARD_ACCENTS.length]
}

/**
 * Agoda-style 10-point score badge. Track-Asia carries no ratings, so this
 * returns null and the cards simply omit the badge rather than showing an
 * invented score.
 */
export function hotelScoreBadge(rating) {
  if (rating == null) return null
  const score = Math.round(rating * 2 * 10) / 10
  const tiers = [
    { min: 9, vi: 'Tuyệt hảo', en: 'Exceptional' },
    { min: 8, vi: 'Tuyệt vời', en: 'Excellent' },
    { min: 7, vi: 'Rất tốt', en: 'Very good' },
    { min: 6, vi: 'Tốt', en: 'Good' },
    { min: 0, vi: 'Khá', en: 'Fair' },
  ]
  const tier = tiers.find((t) => score >= t.min)
  return { score, label: { vi: tier.vi, en: tier.en } }
}
