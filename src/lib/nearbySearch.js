import { hasMapsKey, searchNearbyByCoords, searchPlaces, haversineKm } from './trackAsia.js'
import { searchMapArea } from './mapAreaSearch.js'
import { primaryPlaceName } from './text.js'

// How far "gần đây" reaches when the traveller shares their position.
const NEARBY_RADIUS_KM = 2.5
// A typed or wheel-picked dish is worth travelling a little further for.
const DISH_RADIUS_KM = 5

// FoodTrip only covers Vietnam. A search with no position ("Bánh mì Việt Nam")
// is read by Google as the *cuisine*, and returned a bánh mì shop in Chicago
// as today's suggestion. Anything outside the country's bounds is dropped.
const VIETNAM_BOUNDS = { minLat: 8.2, maxLat: 23.5, minLng: 102.1, maxLng: 109.6 }

function inVietnam(location) {
  if (!location) return false
  const { lat, lng } = location
  return lat >= VIETNAM_BOUNDS.minLat && lat <= VIETNAM_BOUNDS.maxLat
    && lng >= VIETNAM_BOUNDS.minLng && lng <= VIETNAM_BOUNDS.maxLng
}

function toNearbyPlace(p, origin) {
  return {
    id: p.id,
    name: p.name,
    // Track-Asia carries no ratings, review counts or photos — the UI shows
    // the distance and address instead.
    rating: null,
    userRatingCount: null,
    address: p.address,
    location: p.location,
    mapsUri: null,
    thumbnailUrl: null,
    distanceKm: p.distanceKm ?? (origin && p.location ? haversineKm(origin, p.location) : null),
    // The shape the explore map and its place panel read, so this page can
    // open the very same map view instead of a look-alike.
    explore: {
      id: p.id,
      source: 'track-asia',
      category: 'food',
      name: { vi: p.name, en: p.name },
      address: { vi: p.address ?? '', en: p.address ?? '' },
      shortDesc: { vi: '', en: '' },
      location: p.location,
      tags: [],
      price: null,
      rating: null,
      reviews: [],
    },
  }
}

/**
 * A Google Maps result (via the map-place-search function, the same source the
 * explore map uses) in the flat shape this page renders.
 *
 * Names are reduced to the venue's real name: Google listings are often
 * SEO-stuffed ("Cơm tấm 701 - Sườn bì chả chuẩn vị Sài Gòn - 35 Nguyễn Văn
 * Tráng Q1"), which on a card reads as noise and pushes the address out.
 */
function fromGoogle(p, origin) {
  return {
    id: p.id,
    name: primaryPlaceName(p.name.vi) || p.name.vi,
    rating: p.googleRating ?? null,
    userRatingCount: p.googleRatingCount ?? null,
    address: p.address.vi,
    location: p.location,
    mapsUri: p.mapsUrl ?? null,
    thumbnailUrl: p.thumbnailUrl ?? null,
    distanceKm: p.distanceKm ?? (origin && p.location ? haversineKm(origin, p.location) : null),
    // Already in the explore map's own shape (map-place-search normalises it).
    explore: p,
  }
}

/**
 * Google first — it has the photos, ratings and review counts this page shows,
 * and far denser coverage of small eateries than OpenStreetMap.
 *
 * Returns null only when Google could not answer at all, which is when the
 * Track-Asia fallback is worth trying. A Google answer of "nothing here" comes
 * back as an empty list and is final: falling through to Track-Asia on it used
 * to turn "no such place" into "search failed".
 */
async function searchGoogle({ keyword, origin, area, radiusKm }) {
  try {
    const found = await searchMapArea({ keyword, origin, area, radiusKm, category: 'food', pages: 1 })
    if (found.status !== 'ok') return null
    return found.places
      .filter((p) => inVietnam(p.location))
      .map((p) => fromGoogle(p, origin))
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
  } catch {
    return null
  }
}

/**
 * Finds real food places around a GPS point. Tries Google's data first; the
 * Track-Asia path (reverse-geocode the point to an area name, search within it,
 * then filter by true haversine distance) is kept as the fallback.
 */
export async function searchNearbyFood(origin, radiusMeters = NEARBY_RADIUS_KM * 1000) {
  const google = await searchGoogle({ keyword: 'quán ăn', origin, radiusKm: radiusMeters / 1000 })
  if (google !== null) return google

  if (!hasMapsKey) return null
  const results = await searchNearbyByCoords(origin, { keyword: 'quán ăn', radiusKm: radiusMeters / 1000 })
  if (results === null) return null
  return results.map((p) => toNearbyPlace(p, origin))
}

/**
 * A free-form query ("địa điểm ăn sáng ở thủ dầu một") or a wheel-picked dish.
 * With a position it searches around it; without one, Google resolves the place
 * named inside the query itself.
 */
export async function searchFoodByText(textQuery, origin) {
  const google = await searchGoogle(
    origin
      ? { keyword: textQuery, origin, radiusKm: DISH_RADIUS_KM }
      // searchMapArea needs an area when there is no centre; the country keeps
      // Google from reading a bare dish name as a search anywhere in the world.
      : { keyword: textQuery, area: 'Việt Nam' },
  )
  if (google !== null) return google

  if (!hasMapsKey) return null
  const results = (await searchPlaces(textQuery, { limit: 20 })) ?? []
  return results
    .map((p) => toNearbyPlace(p, origin))
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
}

/**
 * The traveller's position, or why it could not be had.
 *
 * Resolves `{ origin }` or `{ error }` — never throws — with the error as
 * 'denied' | 'unavailable' | 'timeout' | 'unsupported', so the page can say
 * which of the four actually happened.
 *
 * Network positioning rather than GPS: a desktop has no GPS, so asking for high
 * accuracy only waits out the timeout and fails. The previous version of this
 * did exactly that in six seconds and then carried on with no position at all,
 * which is how a wheel pick ended up searching the whole world.
 */
export function getPosition(timeout = 15000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'unsupported' })
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ origin: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      async (err) => {
        if (err.code === 1) resolve({ error: await whoDenied() })
        else resolve({ error: err.code === 2 ? 'unavailable' : 'timeout' })
      },
      { enableHighAccuracy: false, timeout, maximumAge: 300000 }
    )
  })
}

/**
 * Chrome on Windows reports PERMISSION_DENIED for two different refusals: the
 * site being blocked in the browser, and Windows itself not letting the
 * browser use location at all. The fixes are in different places, so telling
 * the traveller to unblock the site when the site was never blocked sends them
 * looking for a setting that is already on.
 *
 * The browser's own permission record tells them apart: if it says the site is
 * denied, the site is blocked; if it says granted (or has not been asked), the
 * refusal came from the operating system.
 */
async function whoDenied() {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' })
    if (status && status.state !== 'denied') return 'system-off'
  } catch {
    // Permissions API unavailable — fall back to the browser-level reading.
  }
  return 'denied'
}
