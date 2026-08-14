import { hasMapsKey, searchPlaces, haversineKm } from './trackAsia.js'

// Text search happily returns venues in outlying districts — a Hanoi query can
// surface places 35km+ apart, which produced itineraries with hour-long hops
// between lunch and dinner. Outliers this far from the centre are dropped so a
// day's stops stay realistically reachable.
const MAX_DISTANCE_FROM_CENTRE_KM = 20

/**
 * Estimates the city centre from the results themselves, using the median
 * coordinate so a handful of far-flung entries can't drag it away.
 *
 * Geocoding the city name is not usable here: asking the provider for "Hà Nội"
 * returns a street address that happens to be called Hà Nội, 50km from the
 * actual city, which then filtered out nearly every genuine result.
 */
function medianCentre(places) {
  const located = places.filter((p) => p.location)
  if (!located.length) return null
  const middle = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    const i = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2
  }
  return {
    lat: middle(located.map((p) => p.location.lat)),
    lng: middle(located.map((p) => p.location.lng)),
  }
}

// Heuristic search phrases per internal category — the provider has no notion
// of our food/cafe/attraction taxonomy, so each is queried separately.
//
// Several narrow phrases beat one broad one: "địa điểm tham quan ở Hà Nội"
// returns clinics, car repair shops and estate agents, whereas asking for
// temples/museums/parks by name returns the real thing.
const CATEGORY_QUERIES = {
  food: (city) => [`quán ăn ngon ở ${city}`, `nhà hàng ${city}`],
  cafe: (city) => [`quán cà phê ở ${city}`, `cafe ${city}`],
  attraction: (city) => [`chùa ở ${city}`, `bảo tàng ${city}`, `công viên ${city}`, `di tích lịch sử ${city}`],
}

// The wording of a query never fully constrains what comes back, so results are
// also filtered on the provider's own place types. Without this a search for
// cafés in Hanoi yields clothing shops and an advertising agency, and a search
// for attractions yields a sexual-health clinic — none of which belong in a
// travel itinerary.
const CATEGORY_TYPES = {
  food: ['restaurant', 'food'],
  cafe: ['cafe', 'coffee_shop'],
  attraction: [
    'tourist_attraction', 'museum', 'park', 'temple', 'place_of_worship',
    'historical_monument', 'historical', 'memorial', 'landmark', 'culture',
    'zoo', 'art_gallery', 'beach', 'entertainment_and_recreation',
  ],
}

/** Exact type match — substring matching would let `food_and_drink` pass as a restaurant. */
function matchesCategory(types, category) {
  const allowed = CATEGORY_TYPES[category]
  return (types ?? []).some((t) => allowed.includes(t))
}

// Track-Asia returns OSM-style type tags; map the useful ones onto our tags.
const TYPE_TAG_MAP = {
  seafood: 'seafood',
  cafe: 'coffee',
  coffee: 'coffee',
  bar: 'nightlife',
  nightclub: 'nightlife',
  beach: 'beach',
  museum: 'culture',
  attraction: 'culture',
  tourism: 'culture',
  historic: 'culture',
}

function deriveTags(types) {
  const tags = new Set()
  for (const t of types ?? []) {
    for (const [needle, tag] of Object.entries(TYPE_TAG_MAP)) {
      if (t.includes(needle)) tags.add(tag)
    }
  }
  return [...tags]
}

async function searchCategory(city, category) {
  const batches = await Promise.all(
    CATEGORY_QUERIES[category](city).map((q) => searchPlaces(q, { limit: 10 }).catch(() => []))
  )
  const seen = new Set()
  const results = batches
    .flat()
    .filter((p) => p && matchesCategory(p.types, category) && p.id && !seen.has(p.id) && seen.add(p.id))

  return results.map((place) => ({
    id: place.id,
    city: 'custom',
    category,
    name: { vi: place.name, en: place.name },
    tags: deriveTags(place.types),
    // Track-Asia exposes no rating or price level. 4 is a neutral placeholder
    // so scorePlace() ranks purely on preference match and distance instead of
    // inventing a quality signal that doesn't exist.
    rating: 4,
    price: 1,
    // No opening hours either — treat these as always open rather than
    // guessing, and let the time-slot filter pass them through.
    hours: { open: '00:00', close: '24:00' },
    address: { vi: place.address, en: place.address },
    shortDesc: { vi: '', en: '' },
    longDesc: { vi: '', en: '' },
    reviews: [],
    location: place.location,
    liveRating: null,
    liveReviewCount: null,
    googlePlaceId: place.id,
  }))
}

/**
 * Searches Track-Asia for real candidate venues (food/cafe/attraction) in an
 * arbitrary city not covered by the curated local dataset. Returns null when
 * no API key is configured so callers can show a clear fallback.
 */
export async function searchCityPlaces(cityName) {
  if (!hasMapsKey || !cityName?.trim()) return null

  const categories = Object.keys(CATEGORY_QUERIES)
  const results = await Promise.all(categories.map((cat) => searchCategory(cityName.trim(), cat).catch(() => [])))
  const centre = medianCentre(results.flat())

  // De-duplicate on name as well as id: the provider lists the same venue under
  // several ids (four separate "Bảo Tàng Hà Nội" entries, for instance), which
  // would otherwise fill an itinerary with the same museum four times over.
  const seenIds = new Set()
  const seenNames = new Set()
  const merged = []
  for (const list of results) {
    for (const place of list) {
      const nameKey = place.name.vi.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()
      if (!place.id || seenIds.has(place.id) || seenNames.has(nameKey)) continue
      if (centre && place.location) {
        const km = haversineKm(centre, place.location)
        if (km == null || km > MAX_DISTANCE_FROM_CENTRE_KM) continue
      }
      seenIds.add(place.id)
      seenNames.add(nameKey)
      merged.push(place)
    }
  }
  return merged
}
