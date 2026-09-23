import { searchPlaces, reverseGeocode, haversineKm } from './trackAsia.js'
import { searchMapArea } from './mapAreaSearch.js'

const KEYWORDS = {
  pho: 'quán phở', coffee: 'quán cà phê', seafood: 'quán hải sản',
  noodles: 'quán bún mì', rice: 'quán cơm', hotpot: 'quán lẩu nướng',
  snacks: 'quán ăn vặt', vegetarian: 'quán chay',
}

const CATEGORY_KEYWORDS = {
  all: 'quán ăn',
  food: 'quán ăn nhà hàng',
  cafe: 'quán cà phê',
  attraction: 'địa điểm du lịch',
}

// The provider caps a single search at ~20 results, so one query can never fill
// a map the way a maps app does. Asking the same thing several ways returns
// largely different sets — overlap between two phrasings measured at 2 of 19 —
// and running them in parallel costs no more wall-clock time than one query.
const PHRASINGS = [
  (q, area) => `${q} ${area}`,
  (q, area) => `${q} ở ${area}`,
  (q, area) => `${q} gần ${area}`,
  (q, area) => `${q} ngon ${area}`,
  (q, area) => `${q} đẹp ${area}`,
]

const CAFE_HINTS = ['cà phê', 'cafe', 'coffee', 'trà sữa', 'tiệm trà']

/** Classifies a result from its provider types, falling back to the search wording. */
function categoryOf(types, keyword, requestedCategory) {
  if (requestedCategory === 'attraction') return 'attraction'
  const list = types ?? []
  if (list.includes('cafe') || list.includes('coffee_shop')) return 'cafe'
  if (list.includes('restaurant') || list.includes('food')) return 'food'
  return CAFE_HINTS.some((hint) => keyword.toLowerCase().includes(hint)) ? 'cafe' : 'food'
}

function normalizePlace(result, { keyword, category, cityId, origin }) {
  const rawId = result.id || `${result.name}-${result.address}`
  const id = `live-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90)}`
  return {
    id,
    source: 'track-asia',
    city: cityId || null,
    category: categoryOf(result.types, keyword, category),
    name: { vi: result.name, en: result.name },
    address: { vi: result.address, en: result.address },
    shortDesc: { vi: 'Địa điểm từ dữ liệu bản đồ', en: 'A place from live map data' },
    location: result.location,
    distanceKm: result.distanceKm ?? (origin && result.location ? haversineKm(origin, result.location) : null),
    tags: [],
    // The provider publishes no price level. A placeholder here would feed the
    // suitability model a criterion that scores every place identically, which
    // only compresses the range without telling the traveller anything.
    price: null,
    // No rating: the provider publishes none, and the app must not invent one.
    // Unrated places simply show no score.
    rating: null,
    hours: { open: '00:00', close: '24:00' },
    reviews: [],
  }
}

/**
 * Searches the live map data for places matching a keyword around an area.
 *
 * `origin` (the user's GPS position) scopes the search to whatever area that
 * point reverse-geocodes to, then filters by true distance — the provider has
 * no radius parameter, so proximity has to be applied client-side.
 */
export async function searchExplorePlaces({ foodType, category = 'all', query, city, origin, radiusKm = 5, limit = 80 }) {
  const keyword = query?.trim() || KEYWORDS[foodType] || CATEGORY_KEYWORDS[category]
  if (!keyword) return []

  // Google first whenever a centre point is known. Its Vietnamese coverage is
  // far denser than the basemap provider's — 25 cafés against 2 within 1.5km of
  // one Gò Vấp street — and its results arrive with the ratings the suitability
  // model needs. The provider search below stays as the fallback for when the
  // backend has no Serper key, or Google knows nothing about the area.
  const cityName = city?.name?.vi ?? ''
  if (origin || cityName) {
    try {
      const found = await searchMapArea({
        keyword, origin, area: cityName, category, cityId: city?.id, radiusKm,
      })
      if (found.places.length) return found.places.slice(0, limit)
    } catch { /* fall through to the provider search */ }
  }

  let area = city?.name?.vi ?? ''
  if (origin) area = (await reverseGeocode(origin))?.areaName ?? area
  if (!area) return []

  const batches = await Promise.all(
    PHRASINGS.map((phrase) => searchPlaces(phrase(keyword, area), { limit: 100 }).catch(() => []))
  )

  const seenIds = new Set()
  const seenNames = new Set()
  const places = []
  for (const result of batches.flat()) {
    if (!result?.location) continue
    const nameKey = result.name.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()
    if (!nameKey || seenIds.has(result.id) || seenNames.has(nameKey)) continue
    const place = normalizePlace(result, { keyword, category, cityId: city?.id, origin })
    if (origin && place.distanceKm != null && place.distanceKm > radiusKm) continue
    seenIds.add(result.id)
    seenNames.add(nameKey)
    places.push(place)
  }

  if (origin) places.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
  return places.slice(0, limit)
}
