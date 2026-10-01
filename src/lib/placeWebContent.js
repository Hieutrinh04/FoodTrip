import { hasSupabase, supabase } from './supabaseClient.js'

const CACHE_PREFIX = 'ft_place_web_v7:'
const TTL = 1000 * 60 * 60 * 24 * 3

export async function fetchPlaceWebContent(query, placeName = query, address = '') {
  const cacheKey = `${placeName}|${address}|${query}`
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + cacheKey) || 'null')
    if (cached && Date.now() - cached.time < TTL) return cached.data
  } catch { /* ignore unavailable cache */ }
  if (!hasSupabase) return { status: 'no-key', items: [] }
  const { data, error } = await supabase.functions.invoke(`place-web-content?query=${encodeURIComponent(query)}&name=${encodeURIComponent(placeName)}&address=${encodeURIComponent(address)}`, { method: 'GET' })
  if (error) throw new Error('place-web-content-failed')
  if (data.status === 'ok') {
    try { localStorage.setItem(CACHE_PREFIX + cacheKey, JSON.stringify({ time: Date.now(), data })) } catch { /* ignore */ }
  }
  return data
}
