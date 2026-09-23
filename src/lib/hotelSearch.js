import { hasMapsKey, searchPlaces, lookupPlace, placeMapUrl } from './trackAsia.js'
import { supabase, hasSupabase } from './supabaseClient.js'

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
const HOTEL_CACHE_PREFIX = 'ft_hotel_v1:'
const HOTEL_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7

function readCachedHotel(id) {
  try {
    const cached = JSON.parse(localStorage.getItem(HOTEL_CACHE_PREFIX + id) || 'null')
    return cached && Date.now() - cached.ts < HOTEL_CACHE_TTL_MS ? cached.hotel : null
  } catch {
    return null
  }
}

function cacheHotels(hotels) {
  try {
    const ts = Date.now()
    for (const hotel of hotels) localStorage.setItem(HOTEL_CACHE_PREFIX + hotel.id, JSON.stringify({ hotel, ts }))
  } catch { /* booking still works through router state when storage is unavailable */ }
}

export function rememberHotel(hotel) {
  if (hotel?.id) cacheHotels([hotel])
}

function simulatedPriceLevel(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return SIMULATED_BANDS[h % SIMULATED_BANDS.length]
}

// Bands for a *real* nightly rate in VND, so a hotel priced by Hotelbeds is
// grouped against the trip budget on the same scale as an estimated one.
function priceLevelForVnd(pricePerNight) {
  if (pricePerNight < 500_000) return 'PRICE_LEVEL_INEXPENSIVE'
  if (pricePerNight < 1_500_000) return 'PRICE_LEVEL_MODERATE'
  if (pricePerNight < 3_500_000) return 'PRICE_LEVEL_EXPENSIVE'
  return 'PRICE_LEVEL_VERY_EXPENSIVE'
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
    stars: null,
    rooms: [],
    priceFrom: null,
    priceSource: 'estimated',
  }
}

/**
 * Shapes one hotel from the `hotel-availability` Edge Function, which merges
 * Hotelbeds (real rate, real room types) with Google Maps (photo, rating).
 * `priceSource` decides whether the price band is read off the real tariff or
 * still derived from the hotel id, so an estimate is never dressed up as a
 * quoted rate.
 */
function mapLiveHotel(h) {
  const real = h.priceSource === 'hotelbeds' && h.priceFrom != null
  return {
    id: h.id,
    name: h.name,
    rating: h.rating ?? null,
    userRatingCount: h.userRatingCount ?? null,
    address: h.address ?? h.area ?? null,
    location: h.location ?? null,
    mapsUri: h.mapsUri ?? null,
    priceLevel: real ? priceLevelForVnd(h.priceFrom) : simulatedPriceLevel(h.id),
    photoUrl: h.photoUrl ?? null,
    stars: h.stars ?? null,
    rooms: h.rooms ?? [],
    priceFrom: real ? h.priceFrom : null,
    priceSource: real ? 'hotelbeds' : 'estimated',
    googlePlaceId: h.googlePlaceId ?? null,
  }
}

// Hotelbeds' evaluation plan has a hard daily request quota — exceeding it
// returns 403 "Quota exceeded" and every hotel silently drops back to an
// estimated price. Each visit to the planner's hotel step is one Hotelbeds call
// plus three Serper credits, so repeated passes through the wizard (exactly
// what happens in a demo) would spend the day's budget in minutes. Results for
// a city are therefore reused rather than re-fetched. The TTL is short because
// the rates are for a real stay date and the inventory moves.
const LIVE_CACHE_PREFIX = 'ft_hotels_live_v1:'
const LIVE_CACHE_TTL_MS = 1000 * 60 * 60 * 6

// A response with no quoted prices is worth keeping — it still cost two Serper
// searches — but not for as long: Hotelbeds' daily quota can come back at any
// point, and a six-hour cache would keep estimates on screen long after real
// rates were available again.
const ESTIMATED_CACHE_TTL_MS = 1000 * 60 * 30

function liveCacheKey(cityName, adults) {
  return `${LIVE_CACHE_PREFIX}${cityName.toLowerCase()}|${adults}`
}

function readLiveCache(cityName, adults) {
  try {
    const cached = JSON.parse(localStorage.getItem(liveCacheKey(cityName, adults)) || 'null')
    if (!cached) return null
    const ttl = cached.priced ? LIVE_CACHE_TTL_MS : ESTIMATED_CACHE_TTL_MS
    return Date.now() - cached.ts < ttl ? cached.hotels : null
  } catch {
    return null
  }
}

function writeLiveCache(cityName, adults, hotels) {
  try {
    const priced = hotels.some((hotel) => hotel.priceSource === 'hotelbeds')
    localStorage.setItem(liveCacheKey(cityName, adults), JSON.stringify({ hotels, priced, ts: Date.now() }))
  } catch { /* storage full or unavailable — the next visit just re-fetches */ }
}

/**
 * Asks the Edge Function for live availability. Returns null — not an empty
 * list — whenever the live path can't answer, so the caller falls through to
 * the Track-Asia search rather than showing "no hotels here".
 */
async function fetchLiveHotels({ cityName, adults }) {
  if (!hasSupabase) return null

  const cached = readLiveCache(cityName, adults)
  if (cached) return cached.map(mapLiveHotel)

  try {
    const { data, error } = await supabase.functions.invoke('hotel-availability', {
      body: { cityName, adults },
      signal: AbortSignal.timeout(25000),
    })
    if (error || data?.status !== 'ok' || !data.hotels?.length) return null
    writeLiveCache(cityName, adults, data.hotels)
    return data.hotels.map(mapLiveHotel)
  } catch {
    return null
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
 * Finds real hotels in a destination city — used up front in the planner
 * (right after budget is entered, before an itinerary's stops exist), so it's
 * scoped by city name.
 *
 * Two paths, in order of how much they actually know:
 *   1. the `hotel-availability` Edge Function — real Hotelbeds tariffs and room
 *      types, with Google's photo and rating merged in where the two sources
 *      describe the same property;
 *   2. Track-Asia text search — name and coordinates only, with the price band
 *      derived from the hotel id.
 *
 * Returns null when neither path is configured, so the caller can show its
 * no-key state instead of an empty list.
 */
export async function searchHotelsForCity({ cityName, budgetPerPersonPerDay = 0, maxResultCount = 9, adults = 2 }) {
  const city = cityName?.trim()
  if (!city) return null

  const preferred = preferredPriceLevels(budgetPerPersonPerDay)
  // A stable sort, so the server's own ordering (real prices first, then hotels
  // with a photo) survives inside each budget-fit group.
  const byBudgetFit = (a, b) => {
    const aFit = a.priceLevel && preferred.includes(a.priceLevel) ? 1 : 0
    const bFit = b.priceLevel && preferred.includes(b.priceLevel) ? 1 : 0
    return bFit - aFit
  }

  const live = await fetchLiveHotels({ cityName: city, adults })
  if (live) {
    const hotels = live.sort(byBudgetFit).slice(0, maxResultCount)
    cacheHotels(hotels)
    return hotels
  }

  if (!hasMapsKey) return null
  const results = await searchPlaces(`khách sạn ở ${city}`, { limit: maxResultCount })
  if (results === null) return null

  const hotels = results.map(mapHotel).sort(byBudgetFit)
  cacheHotels(hotels)
  return hotels
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
 * Re-fetches a single hotel by id — used to land directly on a booking page
 * (e.g. a bookmarked `/booking/:placeId` link) without the planner's in-memory
 * hotel list still being around.
 *
 * Hotels that came from the live availability endpoint are only recoverable
 * from the cache: Hotelbeds prices a *stay*, not a property, so there is no
 * "look this hotel up by id" call to make without knowing the dates again.
 * After the cache expires such a link asks the traveller to pick the hotel
 * again rather than showing a stale tariff.
 */
export async function fetchHotelById(placeId) {
  if (!placeId) return null
  const cached = readCachedHotel(placeId)
  if (cached) return cached
  if (/^(hb|g)-/.test(placeId)) return null
  if (!hasMapsKey) return null
  try {
    const place = await lookupPlace(placeId)
    const hotel = place ? mapHotel(place) : null
    if (hotel) cacheHotels([hotel])
    return hotel
  } catch {
    return null
  }
}

// Bands, as shown on a hotel with no quoted rate. A hotel that *does* have one
// shows the rate itself instead, so these read as estimates without needing a
// second qualifier next to them.
export const PRICE_LEVEL_LABEL = {
  PRICE_LEVEL_FREE: { vi: 'Miễn phí', en: 'Free' },
  PRICE_LEVEL_INEXPENSIVE: { vi: 'Giá rẻ (ước tính)', en: 'Budget (est.)' },
  PRICE_LEVEL_MODERATE: { vi: 'Vừa phải (ước tính)', en: 'Moderate (est.)' },
  PRICE_LEVEL_EXPENSIVE: { vi: 'Cao cấp (ước tính)', en: 'Upscale (est.)' },
  PRICE_LEVEL_VERY_EXPENSIVE: { vi: 'Sang trọng (ước tính)', en: 'Luxury (est.)' },
}

/** True when the hotel's price came from a real quoted tariff, not the id hash. */
export function hasRealPrice(hotel) {
  return hotel?.priceSource === 'hotelbeds' && hotel.priceFrom != null
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
