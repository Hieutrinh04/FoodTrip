import { supabase, hasSupabase } from './supabaseClient.js'
import { normalizeVi } from './text.js'
import { resolveDestination, tripRequestCandidates } from './knowledgeBase.js'
import { parseTripRequestLocally } from './tripRequestLocal.js'

// Re-exported for the callers that imported it from here before text.js existed.
export { normalizeVi }

/**
 * Resolves a free-text destination description to either a curated city or a
 * custom destination name. Now backed by the knowledge-base retrieval layer
 * (knowledgeBase.js) instead of a hand-maintained keyword map, so thematic
 * requests ("miền tây sông nước", "núi non săn mây") resolve without a
 * dedicated entry and unknown places ("Quy Nhơn") correctly fall through to a
 * live search.
 */
export function resolveDestinationQuery(query) {
  return resolveDestination(query)
}

const CACHE_PREFIX = 'ft_trip_parse_v1:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // a day — trip requests are rarely re-run, this only catches double-submits and back-navigation

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    return Date.now() - ts < CACHE_TTL_MS ? data : null
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* storage unavailable — the parse still worked */ }
}

/**
 * Turns a free-text trip request into structured planner fields via the
 * parse-trip-request Edge Function.
 *
 * RAG: the local knowledge base is retrieved first and the top city/place
 * candidates are sent as grounding context, so the model answers with a
 * concrete `cityId` (and any `placeIds` the user named) drawn from our own
 * data rather than a free-text guess the client then has to re-resolve.
 * Identical requests are served from a short-lived cache.
 */
export async function parseTripRequestText(text) {
  // Without the model — no backend, no Anthropic key, or the call failing —
  // the request is read with patterns instead, so the button still fills the
  // form rather than only reporting that AI is not configured.
  if (!hasSupabase) return parseTripRequestLocally(text)

  const cacheKey = normalizeVi(text)
  const cached = readCache(cacheKey)
  if (cached) return cached

  const { cityCandidates, placeCandidates } = tripRequestCandidates(text)
  let data
  try {
    const response = await supabase.functions.invoke('parse-trip-request', {
      body: { text, cityCandidates, placeCandidates },
    })
    if (response.error) return parseTripRequestLocally(text)
    data = response.data
  } catch {
    return parseTripRequestLocally(text)
  }
  if (data?.error) return parseTripRequestLocally(text)

  // A grounded cityId is authoritative; otherwise fall back to resolving the
  // model's free-text destinationQuery through the same retrieval layer.
  if (!data.cityId && data.destinationQuery) {
    const resolved = resolveDestination(data.destinationQuery)
    if (resolved?.type === 'curated') data.cityId = resolved.cityId
  }
  writeCache(cacheKey, data)
  return data
}
