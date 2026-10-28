import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { sharePlaceSearch } from '../_shared/sharePlaceSearch.ts'
import { matchKnown } from '../_shared/knownPlaces.js'
import { loadKnown, asCandidate, saveFound, type Candidate, type FoundPlace } from '../_shared/knownPlacesStore.ts'

// A typed venue name (and area) → suggestions. Venues FoodTrip already knows
// come first and cost nothing; the map search adds the rest.
Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight
  if (request.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, { status: 405 })
  try {
    const { query } = await request.json()
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 700) return jsonResponse({ error: 'invalid-query' }, { status: 400 })
    const { places: known, aliases } = await loadKnown()
    const matched = (await Promise.all(matchKnown(query, known, aliases).slice(0, 3).map((m: { place: Parameters<typeof asCandidate>[0] }) => asCandidate(m.place)))).filter(Boolean) as Candidate[]
    let searched: Candidate[] = []
    try {
      searched = await sharePlaceSearch(query.trim())
    } catch (err) {
      if (!matched.length) throw err
    }
    const catalogueSaved = await saveFound(searched as FoundPlace[])
    const seen = new Set<string>()
    const places = [...matched, ...searched].filter((p) => p.location && !seen.has(p.placeId) && seen.add(p.placeId)).slice(0, 8)
    // A search result is a candidate, never an automatic address verification.
    return jsonResponse({ status: 'ok', places, source: matched.length ? 'known' : 'map-search', catalogueSaved })
  } catch {
    return jsonResponse({ error: 'search-unavailable' }, { status: 502 })
  }
})
