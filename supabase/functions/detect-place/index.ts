import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { sharePlaceSearch } from '../_shared/sharePlaceSearch.ts'

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight
  if (request.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, { status: 405 })
  try {
    const { caption } = await request.json()
    if (typeof caption !== 'string' || !caption.trim() || caption.length > 10000) return jsonResponse({ error: 'invalid-caption' }, { status: 400 })
    // Search text is untrusted data. No model instructions or inferred coordinates.
    const query = caption.replace(/https?:\/\/\S+/g, ' ').replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
    if (query.length < 3) return jsonResponse({ places: [], source: 'caption-search' })
    const places = await sharePlaceSearch(query)
    return jsonResponse({ places, source: 'caption-search', requiresConfirmation: true })
  } catch {
    return jsonResponse({ error: 'search-unavailable' }, { status: 502 })
  }
})
