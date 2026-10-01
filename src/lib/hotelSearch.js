import { hasMapsKey, searchPlaces, lookupPlace, placeMapUrl } from './trackAsia.js'
import { supabase, hasSupabase } from './supabaseClient.js'
import { nightlyPriceOf } from './roomTypes.js'
import { budgetTier, TIER_ORDER } from './hotelBudget.js'

export { LODGING_SHARE, nightlyRoomBudget, groupHotelsByBudgetTier } from './hotelBudget.js'

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

// The budget changes which hotels the server sends back, so it is part of the
// key — rounded to 100k so dragging the slider does not miss the cache.
function liveCacheKey(cityName, adults, maxPricePerNight) {
  return `${LIVE_CACHE_PREFIX}${cityName.toLowerCase()}|${adults}|${Math.round((maxPricePerNight ?? 0) / 100000)}`
}

function readLiveCache(cityName, adults, maxPricePerNight) {
  try {
    const cached = JSON.parse(localStorage.getItem(liveCacheKey(cityName, adults, maxPricePerNight)) || 'null')
    if (!cached) return null
    const ttl = cached.priced ? LIVE_CACHE_TTL_MS : ESTIMATED_CACHE_TTL_MS
    return Date.now() - cached.ts < ttl ? cached.hotels : null
  } catch {
    return null
  }
}

function writeLiveCache(cityName, adults, maxPricePerNight, hotels) {
  try {
    const priced = hotels.some((hotel) => hotel.priceSource === 'hotelbeds')
    localStorage.setItem(liveCacheKey(cityName, adults, maxPricePerNight), JSON.stringify({ hotels, priced, ts: Date.now() }))
  } catch { /* storage full or unavailable — the next visit just re-fetches */ }
}

/**
 * Asks the Edge Function for live availability. Returns null — not an empty
 * list — whenever the live path can't answer, so the caller falls through to
 * the Track-Asia search rather than showing "no hotels here".
 */
async function fetchLiveHotels({ cityName, adults, maxPricePerNight }) {
  if (!hasSupabase) return null

  const cached = readLiveCache(cityName, adults, maxPricePerNight)
  if (cached) return cached.map(mapLiveHotel)

  try {
    const { data, error } = await supabase.functions.invoke('hotel-availability', {
      body: { cityName, adults, maxPricePerNight },
      signal: AbortSignal.timeout(25000),
    })
    if (error || data?.status !== 'ok' || !data.hotels?.length) return null
    writeLiveCache(cityName, adults, maxPricePerNight, data.hotels)
    return data.hotels.map(mapLiveHotel)
  } catch {
    return null
  }
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
 * Ordered by fit to `nightlyBudget`: within it, then cheaper, then unpriced,
 * then over it (cheapest first). Returns null when neither path is
 * configured, so the caller can show its no-key state instead of an empty list.
 */
export async function searchHotelsForCity({ cityName, nightlyBudget = 0, maxResultCount = 12, adults = 2 }) {
  const city = cityName?.trim()
  if (!city) return null

  // A stable sort, so the server's own ordering survives inside each group.
  const byBudgetFit = (a, b) => {
    const ta = budgetTier(nightlyPriceOf(a), nightlyBudget)
    const tb = budgetTier(nightlyPriceOf(b), nightlyBudget)
    if (ta !== tb) return TIER_ORDER[ta] - TIER_ORDER[tb]
    return ta === 'premium' ? nightlyPriceOf(a) - nightlyPriceOf(b) : 0
  }

  const live = await fetchLiveHotels({ cityName: city, adults, maxPricePerNight: nightlyBudget || undefined })
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
  // Hotelbeds, Google and FoodTrip's own (partner) ids are not map places.
  if (/^(hb|g|ft)-/.test(placeId)) return null
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
  // Hotelbeds' quoted tariff, or a partner's own cheapest room.
  return ['hotelbeds', 'partner'].includes(hotel?.priceSource) && hotel.priceFrom != null
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
