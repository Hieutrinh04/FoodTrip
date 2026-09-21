import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { sharePlaceSearch } from '../_shared/sharePlaceSearch.ts'

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight
  if (request.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, { status: 405 })
  try {
    const { query } = await request.json()
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 700) return jsonResponse({ error: 'invalid-query' }, { status: 400 })
    const places = await sharePlaceSearch(query.trim())
    // A search result is a candidate, never an automatic address verification.
    return jsonResponse({ status: 'ok', places, source: 'map-search' })
  } catch {
    return jsonResponse({ error: 'search-unavailable' }, { status: 502 })
  }
})
