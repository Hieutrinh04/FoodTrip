import { supabase, hasSupabase } from './supabaseClient.js'

/**
 * Google Maps reviews for the place open in the map panel.
 *
 * Looked up by Google's own ids for the listing — the `cid` in its Maps link,
 * else its placeId — so the reviews are of this exact place and not a namesake.
 * Both come from the place-details lookup the panel already makes.
 *
 * Kept for a day: reviews change slowly, and each lookup costs Serper credits.
 */
const CACHE_PREFIX = 'ft_place_reviews_v1:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24

/** The numeric id in a `https://www.google.com/maps?cid=…` link, if any. */
export function cidFromMapsUrl(url) {
  const match = /[?&]cid=(\d+)/.exec(url ?? '')
  return match ? match[1] : null
}

function readCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null')
    return cached && Date.now() - cached.ts < CACHE_TTL_MS ? cached.data : null
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* storage full or unavailable — the next open re-fetches */ }
}

/**
 * Returns `{ status, reviews }`. `status` is 'ok', 'no-id' (the place never
 * matched a Google listing), 'no-key', or 'error' — the panel shows each
 * differently, and none of them throws.
 */
export async function fetchPlaceReviews({ mapsUrl, placeId, sortBy = 'mostRelevant' }) {
  const cid = cidFromMapsUrl(mapsUrl)
  if (!cid && !placeId) return { status: 'no-id', reviews: [] }
  if (!hasSupabase) return { status: 'error', reviews: [] }

  const key = `${cid ?? placeId}:${sortBy}`
  const cached = readCache(key)
  if (cached) return cached

  const params = new URLSearchParams({ sortBy })
  if (cid) params.set('cid', cid)
  else params.set('placeId', placeId)

  try {
    const { data, error } = await supabase.functions.invoke(`place-reviews?${params}`, {
      method: 'GET',
      signal: AbortSignal.timeout(20000),
    })
    if (error || !data) return { status: 'error', reviews: [] }
    const result = { status: data.status ?? 'error', reviews: data.reviews ?? [] }
    if (result.status === 'ok') writeCache(key, result)
    return result
  } catch {
    return { status: 'error', reviews: [] }
  }
}
