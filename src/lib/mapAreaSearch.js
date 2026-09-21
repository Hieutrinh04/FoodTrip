import { hasSupabase, supabase } from './supabaseClient.js'

/**
 * Searches Google's Maps data for places around a point.
 *
 * The basemap provider is built on OpenStreetMap, whose Vietnamese POI coverage
 * is far thinner than Google's. Measured on Huỳnh Văn Nghệ (Gò Vấp): within
 * 1.5km it lists 2 cafés where Google lists 25. This is what lets the map show
 * the places a traveller actually expects to see.
 *
 * Results carry real ratings and review counts, which is also what finally
 * gives the suitability model in placeScore.js something beyond distance to
 * work with.
 */

const CACHE_PREFIX = 'ft_area_search_v1:'
const TTL = 1000 * 60 * 60 * 24

// Each search costs 6 Serper credits, so nearby taps must not each trigger a
// fresh one. Rounding the centre to ~110m buckets means panning slightly and
// tapping again reuses the previous answer.
const COORD_PRECISION = 3

function cacheKey(keyword, origin, radiusKm, area) {
  if (!origin) return `${CACHE_PREFIX}${keyword}|area:${area}`
  const lat = origin.lat.toFixed(COORD_PRECISION)
  const lng = origin.lng.toFixed(COORD_PRECISION)
  return `${CACHE_PREFIX}${keyword}|${lat},${lng}|${radiusKm}`
}

function readCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null')
    return cached && Date.now() - cached.time < TTL ? cached.places : null
  } catch {
    return null
  }
}

function writeCache(key, places) {
  try {
    localStorage.setItem(key, JSON.stringify({ time: Date.now(), places }))
  } catch { /* quota or private mode — the search still worked */ }
}

const CAFE_HINTS = ['cà phê', 'cafe', 'coffee', 'trà sữa', 'tiệm trà']
const ATTRACTION_HINTS = ['tham quan', 'du lịch', 'điểm đến', 'bảo tàng', 'chùa', 'công viên']

/** Maps Google's category text onto the three categories the app filters by. */
function categoryOf(place, keyword, requestedCategory) {
  if (requestedCategory && requestedCategory !== 'all') return requestedCategory
  const haystack = [place.category, ...(place.categories ?? [])].join(' ').toLowerCase()
  if (CAFE_HINTS.some((hint) => haystack.includes(hint))) return 'cafe'
  if (ATTRACTION_HINTS.some((hint) => haystack.includes(hint))) return 'attraction'
  if (haystack.includes('nhà hàng') || haystack.includes('quán ăn') || haystack.includes('restaurant')) return 'food'
  return CAFE_HINTS.some((hint) => keyword.toLowerCase().includes(hint)) ? 'cafe' : 'food'
}

/** Today's opening window, in the `{ open, close }` shape the app filters on. */
function todayWindow(hours) {
  const today = hours?.find?.((row) => row.weekday === new Date().getDay())
  if (!today?.open || !today?.close) return { open: '00:00', close: '24:00' }
  return { open: today.open, close: today.close }
}

function normalise(place, { keyword, category, cityId }) {
  const rawId = place.placeId ?? `${place.name}-${place.location.lat}`
  return {
    id: `gmaps-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90)}`,
    source: 'google-maps',
    city: cityId || null,
    category: categoryOf(place, keyword, category),
    name: { vi: place.name, en: place.name },
    address: { vi: place.address ?? '', en: place.address ?? '' },
    shortDesc: { vi: place.category ?? 'Địa điểm trên bản đồ', en: place.category ?? 'A place on the map' },
    location: place.location,
    distanceKm: place.distanceKm ?? null,
    tags: [],
    // Google publishes a price *range* string, not the 0–3 tier the local
    // dataset uses, so the tier stays unknown and the range is shown as-is.
    price: null,
    priceLevel: place.priceLevel ?? null,
    // Deliberately NOT `rating`: that field drives foodTripScore, which derives
    // five per-criterion scores from it. Inventing "Vệ sinh 4.6" out of a single
    // Google star rating would be fabrication. The real figure is kept apart,
    // shown as Google's own, and fed to the suitability model as one input.
    rating: null,
    googleRating: place.rating,
    googleRatingCount: place.ratingCount,
    hours: todayWindow(place.hours),
    weeklyHours: place.hours ?? null,
    phone: place.phone ?? null,
    website: place.website ?? null,
    thumbnailUrl: place.thumbnailUrl ?? null,
    mapsUrl: place.mapsUrl ?? null,
    reviews: [],
  }
}

/**
 * @param keyword   what to look for, e.g. "quán cà phê"
 * @param origin    { lat, lng } centre of the search
 * @param radiusKm  how far out to keep results
 * @returns { status, places } — `status` is 'no-key' when the backend has no
 *          Serper key configured, letting the caller fall back to the basemap
 *          provider's own search.
 */
export async function searchMapArea({ keyword, origin = null, area = '', radiusKm = 3, category = 'all', cityId = null, pages = 2 }) {
  // Either a centre point or a named area is enough; without both there is
  // nothing to search around.
  if (!keyword || (!origin && !area)) return { status: 'not-found', places: [] }

  const key = cacheKey(keyword, origin, radiusKm, area)
  const cached = readCache(key)
  if (cached) return { status: 'ok', places: cached, cached: true }
  if (!hasSupabase) return { status: 'no-key', places: [] }

  // Naming the area inside the query is what lets Google resolve a whole city
  // without us geocoding it first.
  const params = new URLSearchParams({
    q: origin ? keyword : `${keyword} ${area}`,
    radiusKm: String(radiusKm),
    pages: String(pages),
  })
  if (origin) {
    params.set('lat', String(origin.lat))
    params.set('lng', String(origin.lng))
  }

  const { data, error } = await supabase.functions.invoke(`map-place-search?${params}`, { method: 'GET' })
  if (error) throw new Error('map-place-search-failed')
  if (data.status !== 'ok') return { status: data.status, places: [] }

  const places = data.places.map((place) => normalise(place, { keyword, category, cityId }))
  writeCache(key, places)
  return { status: 'ok', places }
}
