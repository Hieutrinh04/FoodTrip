import { supabase, hasSupabase } from './supabaseClient.js'

const CACHE_PREFIX = 'ft_yt_videos_v5:'
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

/** Fetches (and caches) real YouTube Shorts about a place, auto-discovered — no user submission needed. */
export async function fetchYoutubeShorts(query, placeName = query, location = '') {
  const cacheKey = `${placeName}|${location}|${query}`
  const cached = readCache(cacheKey)
  if (cached) return cached
  if (!hasSupabase) return { status: 'no-key', videos: [] }

  const { data, error } = await supabase.functions.invoke(`youtube-shorts?query=${encodeURIComponent(query)}&name=${encodeURIComponent(placeName)}&location=${encodeURIComponent(location)}`, { method: 'GET' })
  if (error) throw new Error('youtube-shorts-failed')

  if (data.status === 'ok') writeCache(cacheKey, data)
  return data
}
