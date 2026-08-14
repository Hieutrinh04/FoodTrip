import { jsonResponse, handleOptions } from '../_shared/cors.ts'

const SEARCH_URL = 'https://www.googleapis.com/customsearch/v1'

// Matches an actual hotel/property page, not a search/listing/homepage on
// either site — those wouldn't take the user anywhere useful.
const AGODA_HOTEL_RE = /^https:\/\/(www\.)?agoda\.com\/[^/]+\/hotel\//
const TRAVELOKA_HOTEL_RE = /^https:\/\/(www\.)?traveloka\.com\/[a-z-]+\/hotel\//

/**
 * Finds the real Agoda/Traveloka listing page for a hotel via Google's
 * official Custom Search JSON API (not scraping — Agoda/Traveloka have no
 * public booking API to integrate against, and scraping their pages would
 * violate their ToS and break constantly against bot detection). One query
 * covers both sites; results are classified by domain afterward.
 */
async function searchHotelListings(hotelName: string, cityName: string) {
  const apiKey = Deno.env.get('GOOGLE_CUSTOM_SEARCH_KEY')
  const cx = Deno.env.get('GOOGLE_CUSTOM_SEARCH_CX')
  if (!apiKey || !cx) return { status: 'no-key', agodaUrl: null, travelokaUrl: null }

  const query = `${hotelName} ${cityName} (site:agoda.com OR site:traveloka.com)`
  const params = new URLSearchParams({ key: apiKey, cx, q: query, num: '10' })
  const res = await fetch(`${SEARCH_URL}?${params}`)
  if (!res.ok) throw new Error(`Custom Search ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()

  const links: string[] = (json.items || []).map((it: { link?: string }) => it.link).filter(Boolean)
  const agodaUrl = links.find((l) => AGODA_HOTEL_RE.test(l)) ?? null
  const travelokaUrl = links.find((l) => TRAVELOKA_HOTEL_RE.test(l)) ?? null

  return { status: 'ok', agodaUrl, travelokaUrl }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { hotelName, cityName } = await req.json()
    if (!hotelName) return jsonResponse({ error: 'missing-hotel-name' }, { status: 400 })
    const result = await searchHotelListings(hotelName, cityName || '')
    return jsonResponse(result)
  } catch (err) {
    console.error('search-hotel-listings failed:', (err as Error).message)
    return jsonResponse({ error: 'search-failed', message: (err as Error).message }, { status: 502 })
  }
})
