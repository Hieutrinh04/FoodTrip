import { supabase, hasSupabase } from './supabaseClient.js'

const CACHE_PREFIX = 'ft_tt_search_v4:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

function readCache(query) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + query)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function writeCache(query, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + query, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // storage unavailable/full — skip caching silently
  }
}

/** Auto-discovers real TikTok videos about a place via the configured web search provider (cached). */
export async function fetchTikTokAutoSuggestions(query, placeName = query, location = '') {
  const cacheKey = `${placeName}|${location}|${query}`
  const cached = readCache(cacheKey)
  if (cached) return cached
  if (!hasSupabase) return { status: 'no-key', videos: [] }

  const { data, error } = await supabase.functions.invoke(`tiktok-web-search?query=${encodeURIComponent(query)}&name=${encodeURIComponent(placeName)}&location=${encodeURIComponent(location)}`, { method: 'GET' })
  if (error) throw new Error('tiktok-web-search-failed')

  if (data.status === 'ok') writeCache(cacheKey, data)
  return data
}
