import { normalizeSearchText } from './relevance.ts'
import { haversineKm } from './serperPlace.ts'

/**
 * Decides when a Hotelbeds property and a Google Maps (Serper) result are the
 * same hotel, so one card can carry Hotelbeds' real tariff *and* Google's real
 * photo and rating.
 *
 * Getting this wrong is expensive in both directions: a missed match only costs
 * a placeholder image, but a false match prices one hotel with another hotel's
 * rate. The thresholds below were tuned against Hội An, Đà Lạt and Sa Pa until
 * no false positive survived — the naive version had matched "Hoi An Silk
 * Marina Resort" to "Bel Marina Hoi An Resort", and scored an unrelated pair
 * 1.00 because both names reduced to the single token "hoi".
 */

// Words that appear in so many Vietnamese hotel names that sharing one says
// nothing about two properties being the same.
const GENERIC_HOTEL_WORDS = new Set([
  'hotel', 'hotels', 'resort', 'resorts', 'spa', 'villa', 'villas', 'the', 'and', 'by',
  'khach', 'san', 'boutique', 'hostel', 'homestay', 'house', 'inn', 'suites', 'suite',
  'apartment', 'apartments', 'beach', 'lake', 'old', 'town', 'retreat', 'lodge', 'eco',
  'khu', 'nghi', 'duong', 'luxury', 'little', 'grand', 'view', 'center', 'centre',
])

// Close enough that two records can plausibly be one building, far enough to
// tolerate Google and Hotelbeds pinning slightly different entrances.
const MAX_MATCH_KM = 1

// Share of the *larger* name's distinctive tokens that must agree. Scoring over
// the larger set is what stops a one-token name from matching everything.
const MIN_NAME_SCORE = 0.6

function distinctiveTokens(name: string, cityTokens: Set<string>) {
  return normalizeSearchText(name)
    .split(' ')
    .filter((token) => token.length > 1 && !GENERIC_HOTEL_WORDS.has(token) && !cityTokens.has(token))
}

function nameScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  let shared = 0
  for (const token of new Set(a)) if (setB.has(token)) shared++
  return shared / Math.max(new Set(a).size, setB.size)
}

export type MatchablePlace = {
  name?: string | null
  location?: { lat: number; lng: number } | null
  rating?: number | null
  ratingCount?: number | null
  thumbnailUrl?: string | null
  mapsUrl?: string | null
  address?: string | null
  placeId?: string | null
}

/** The Google result that is the same hotel, or null when none is convincing. */
export function findGoogleTwin(
  hotel: { name: string; location: { lat: number; lng: number } | null },
  places: MatchablePlace[],
  cityName: string,
) {
  if (!hotel.location) return null
  const cityTokens = new Set(normalizeSearchText(cityName).split(' ').filter(Boolean))
  const hotelTokens = distinctiveTokens(hotel.name, cityTokens)
  if (!hotelTokens.length) return null

  let best: MatchablePlace | null = null
  let bestScore = 0
  for (const place of places) {
    if (!place.location || !place.name) continue
    if (haversineKm(hotel.location, place.location) > MAX_MATCH_KM) continue
    const score = nameScore(hotelTokens, distinctiveTokens(place.name, cityTokens))
    if (score > bestScore) {
      bestScore = score
      best = place
    }
  }
  return bestScore >= MIN_NAME_SCORE ? best : null
}

// Sites that publish photographs of a specific property they list. A photo
// found anywhere else — a blog, a stock library, a social post — may be of
// anything, and a booking page is the worst place to guess.
const PHOTO_HOST_ALLOWLIST = [
  'agoda.com', 'agoda.net', 'booking.com', 'bstatic.com', 'traveloka.com', 'tvlk.com',
  'tripadvisor.com', 'tripadvisor.com.vn', 'tacdn.com', 'expedia.com', 'hotels.com',
  'trivago.com', 'klook.com', 'mytour.vn', 'vntrip.vn', 'ivivu.com', 'hotelmix.vn',
]

export function photoHostAllowed(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return PHOTO_HOST_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

/**
 * Whether a web image result is plausibly of this hotel.
 *
 * Requires every word of the hotel's name, minus the city, to appear in the
 * result's own title or page URL. That is deliberately strict: a photo merely
 * captioned "Hoi An" must never end up on a specific property's booking page,
 * and a traveller has no way to tell that it is the wrong building.
 *
 * Unlike `findGoogleTwin`, this keeps words like "homestay", "view" and "villa"
 * rather than discarding them as generic. Those words are uninformative when
 * deciding whether two *hotels* are the same, but they are most of the name of
 * a place like "The View Homestay" — dropping them left nothing to match on and
 * rejected every photo of it.
 */
export function photoMatchesHotel(text: string, hotelName: string, cityName: string) {
  const cityTokens = new Set(normalizeSearchText(cityName).split(' ').filter(Boolean))
  const wanted = normalizeSearchText(hotelName)
    .split(' ')
    .filter((token) => token.length > 1 && !cityTokens.has(token))
  if (!wanted.length) return false
  const haystack = ` ${normalizeSearchText(text)} `
  return wanted.every((token) => haystack.includes(` ${token} `))
}

export { distinctiveTokens, nameScore, MAX_MATCH_KM, MIN_NAME_SCORE }
