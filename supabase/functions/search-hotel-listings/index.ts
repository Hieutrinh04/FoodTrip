import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { listingMatchesHotel } from '../_shared/hotelMatch.ts'
import { hasSerperKey, serper } from '../_shared/serper.ts'

// Matches an actual hotel/property page, not a search/listing/homepage on
// either site — those wouldn't take the user anywhere useful.
const AGODA_HOTEL_RE = /^https:\/\/(www\.)?agoda\.com\/([a-z-]+\/)?[^/]+\/hotel\//
const TRAVELOKA_HOTEL_RE = /^https:\/\/(www\.)?traveloka\.com\/[a-z-]+\/hotel\//

/**
 * Finds the real Agoda/Traveloka listing page for a hotel with a web search
 * (not scraping — neither site has a public booking API, and scraping their
 * pages would violate their terms and break against bot detection). Results
 * are classified by domain afterward.
 *
 * Runs on Serper. It used Google's Custom Search JSON API, which now answers
 * 403 for this project, so every "So sánh giá" link had silently gone dead.
 */
async function searchHotelListings(hotelName: string, cityName: string) {
  if (!hasSerperKey()) return { status: 'no-key', agodaUrl: null, travelokaUrl: null }

  // One plain search per site: Serper's free plan refuses `site:`. Without it
  // the results include the chain's other branches, so each link must also
  // name this hotel in its path, not merely be the first Agoda page.
  const [agoda, traveloka] = await Promise.all([
    serper('search', `${hotelName} ${cityName} agoda`, 10),
    serper('search', `${hotelName} ${cityName} traveloka`, 10),
  ])
  const pick = (items: { link?: string }[], pattern: RegExp) =>
    items.map((item) => item.link ?? '').find((link) => pattern.test(link) && listingMatchesHotel(link, hotelName)) ?? null

  return { status: 'ok', agodaUrl: pick(agoda, AGODA_HOTEL_RE), travelokaUrl: pick(traveloka, TRAVELOKA_HOTEL_RE) }
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
