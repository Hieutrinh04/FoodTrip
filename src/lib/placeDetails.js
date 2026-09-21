import { hasSupabase, supabase } from './supabaseClient.js'

/**
 * The factual profile of a place — rating, review count, opening hours, phone,
 * website, price range, photo — which the map provider does not publish.
 *
 * Each lookup costs 3 Serper credits, and this data barely changes, so a found
 * listing is cached for a week. Misses are cached for a day only — long enough
 * to stop re-asking on every click, short enough that a matching fix reaches
 * people who already looked.
 */

const CACHE_PREFIX = 'ft_place_details_v2:'
const DAY = 1000 * 60 * 60 * 24
// A found listing barely changes, so it is worth holding on to.
const TTL_FOUND = DAY * 7
// A miss is held far more briefly. It can mean the place genuinely has no
// listing, but it can equally mean our name matching failed — and caching that
// for a week hides every later improvement from anyone who already looked.
const TTL_MISSING = DAY

function readCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null')
    if (!cached) return null
    const ttl = cached.data?.status === 'ok' ? TTL_FOUND : TTL_MISSING
    return Date.now() - cached.time < ttl ? cached.data : null
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ time: Date.now(), data }))
  } catch { /* quota or private mode — the lookup still worked */ }
}

export async function fetchPlaceDetails({ name, address = '', location = null }) {
  if (!name) return { status: 'not-found', place: null }
  const cacheKey = `${name}|${address}`
  const cached = readCache(cacheKey)
  if (cached) return cached
  if (!hasSupabase) return { status: 'no-key', place: null }

  const params = new URLSearchParams({ name, address })
  // Coordinates disambiguate common names like "Quán Cà Phê", which otherwise
  // resolve to whichever branch Google ranks first, anywhere in the country.
  if (location) {
    params.set('lat', String(location.lat))
    params.set('lng', String(location.lng))
  }

  const { data, error } = await supabase.functions.invoke(`place-details?${params}`, { method: 'GET' })
  if (error) throw new Error('place-details-failed')
  // A transient upstream error must not be cached for a week.
  if (data.status === 'ok' || data.status === 'not-found') writeCache(cacheKey, data)
  return data
}

/** Today's row from the normalised weekly hours. */
export function todayHours(hours) {
  if (!hours?.length) return null
  return hours.find((row) => row.weekday === new Date().getDay()) ?? null
}

/** Whether the place is open right now, or null when hours are unknown. */
export function isOpenNow(hours) {
  const today = todayHours(hours)
  if (!today?.open || !today?.close) return null
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const [oh, om] = today.open.split(':').map(Number)
  const [ch, cm] = today.close.split(':').map(Number)
  const open = oh * 60 + om
  const close = ch * 60 + cm
  // A close time earlier than the open time means the place runs past midnight.
  return close < open ? minutes >= open || minutes <= close : minutes >= open && minutes <= close
}
