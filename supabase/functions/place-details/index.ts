import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { normalizeSearchText, GENERIC_WORDS } from '../_shared/relevance.ts'
import { callSerperMaps, haversineKm, shapePlace, type SerperPlace } from '../_shared/serperPlace.ts'

/**
 * Fetches the factual profile of one place — rating, review count, opening
 * hours, phone, website, price range, photo — from Google's Maps data via
 * Serper.
 *
 * The map provider (Track-Asia) publishes coordinates and names only, so
 * without this the app has no rating or review count for any live result and
 * the suitability model in placeScore.js falls back to distance alone.
 *
 * Uses the `maps` endpoint rather than `places`: the latter costs 1 credit
 * instead of 3 but omits phone, website, opening hours and the photo, and
 * truncates the review count (it reported 1 where maps reported 1300).
 */

// Serper ranks loosely related places into the same result set, so a match is
// accepted only when it is both near the coordinates we already have and
// plausibly the same name. 400m allows for the usual disagreement between two
// providers' pins for the same building without letting a different branch of
// the same chain win.
const MAX_MATCH_DISTANCE_KM = 0.4

// The map provider prefixes almost every result with its business type, so
// "Quán Cà Phê Cocobox" must still match the listing titled "Cocobox - Juice
// Bar, Café & Farm Shop". Without stripping these, the one word that actually
// identifies the place counts for a quarter of the score and the match fails.
const NAME_NOISE = new Set([...GENERIC_WORDS, 'ca', 'phe', 'bar', 'shop', 'juice', 'store', 'farm'])

/** Share of the requested name's distinctive words present in a candidate title. */
function nameOverlap(candidate: string, wanted: string) {
  const haystack = ` ${normalizeSearchText(candidate)} `
  const words = normalizeSearchText(wanted).split(' ').filter((t) => t.length >= 2)
  const distinctive = words.filter((t) => !NAME_NOISE.has(t))
  // A name made entirely of generic words has nothing distinctive to match on;
  // fall back to the full set rather than matching everything.
  const tokens = [...new Set(distinctive.length ? distinctive : words)]
  if (!tokens.length) return 0
  return tokens.filter((token) => haystack.includes(` ${token} `)).length / tokens.length
}

function pickBestMatch(results: SerperPlace[], name: string, origin: { lat: number; lng: number } | null) {
  let best: { place: SerperPlace; score: number } | null = null
  for (const place of results) {
    if (!place.title) continue
    const overlap = nameOverlap(place.title, name)
    // Half the distinctive words is the floor: below that it is a different
    // business that merely shares a generic word like "quán" or "cà phê".
    if (overlap < 0.5) continue

    let proximity = 0.5
    if (origin && place.latitude != null && place.longitude != null) {
      const km = haversineKm(origin, { lat: place.latitude, lng: place.longitude })
      if (km > MAX_MATCH_DISTANCE_KM) continue
      proximity = 1 - km / MAX_MATCH_DISTANCE_KM
    }

    const score = overlap * 0.6 + proximity * 0.4
    if (!best || score > best.score) best = { place, score }
  }
  return best?.place ?? null
}

async function fetchPlaceDetails(name: string, address: string, origin: { lat: number; lng: number } | null) {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) return { status: 'no-key', place: null }

  const body: Record<string, unknown> = { q: `${name} ${address}`.trim(), gl: 'vn', hl: 'vi' }
  // Biasing the search to the coordinates we already hold is what keeps a
  // common name like "Quán Cà Phê" from resolving to a different city.
  if (origin) body.ll = `@${origin.lat},${origin.lng},15z`

  const json = await callSerperMaps(apiKey, body)
  const match = pickBestMatch(json.places ?? [], name, origin)
  // A miss is a normal outcome, not an error: plenty of small places have no
  // Google listing at all. The client then shows what it already has.
  if (!match) return { status: 'not-found', place: null }
  return { status: 'ok', place: shapePlace(match) }
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight

  const params = new URL(request.url).searchParams
  const name = params.get('name')?.trim()
  if (!name) return jsonResponse({ error: 'missing-name' }, { status: 400 })

  const address = params.get('address')?.trim() ?? ''
  // Read the params before converting: Number(null) is 0, and 0 is finite, so a
  // request with no coordinates would otherwise be biased to null island and
  // every real place rejected as too far away.
  const rawLat = params.get('lat')
  const rawLng = params.get('lng')
  const lat = Number(rawLat)
  const lng = Number(rawLng)
  const origin = rawLat && rawLng && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null

  try {
    return jsonResponse(await fetchPlaceDetails(name, address, origin))
  } catch (error) {
    console.error('place-details failed:', (error as Error).message)
    return jsonResponse({ status: 'error', place: null }, { status: 502 })
  }
})
