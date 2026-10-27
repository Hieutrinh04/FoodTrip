import { supabase, hasSupabase } from './supabaseClient.js'

const CACHE_PREFIX = 'ft_tt_search_v9:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

// The server (which also caches, for everyone) says how long a result stays
// good in `staleAt` — sooner than the 7 days when a thumbnail link it carries
// expires — so a stored copy never serves dead thumbnails.
function readCache(query) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + query)
    if (!raw) return null
    const { data, ts, staleAt } = JSON.parse(raw)
    if (Date.now() > (staleAt ?? ts + CACHE_TTL_MS)) return null
    return data
  } catch {
    return null
  }
}

function writeCache(query, data) {
  try {
    const staleAt = Math.min(Date.parse(data.staleAt) || Infinity, Date.now() + CACHE_TTL_MS)
    localStorage.setItem(CACHE_PREFIX + query, JSON.stringify({ data, ts: Date.now(), staleAt }))
  } catch {
    // storage unavailable/full — skip caching silently
  }
}

// One request per place at a time: the map panel and a re-render (or React's
// dev double-effect) asking together share the answer.
const inFlight = new Map()

/** Auto-discovers real TikTok videos about a place via the configured web search provider (cached). */
export function fetchTikTokAutoSuggestions(query, placeName = query, location = '', address = '') {
  const cacheKey = `${placeName}|${location}|${address}|${query}`
  const cached = readCache(cacheKey)
  if (cached) return Promise.resolve(cached)
  if (!hasSupabase) return Promise.resolve({ status: 'no-key', videos: [] })
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)

  const request = supabase.functions
    .invoke(`tiktok-web-search?query=${encodeURIComponent(query)}&name=${encodeURIComponent(placeName)}&location=${encodeURIComponent(location)}&address=${encodeURIComponent(address)}`, { method: 'GET' })
    .then(({ data, error }) => {
      if (error) throw new Error('tiktok-web-search-failed')
      if (data.status === 'ok') writeCache(cacheKey, data)
      return data
    })
    .finally(() => inFlight.delete(cacheKey))
  inFlight.set(cacheKey, request)
  return request
}
