import { supabase, hasSupabase } from './supabaseClient.js'
import { cityFromAddress } from './text.js'

/**
 * The booking page's photo gallery: several angles of the property, plus the
 * photos belonging to each room type where they exist.
 *
 * Two sources, and the page says which it is showing:
 *   `hotelbeds` — the property's own photographs, including per-room shots.
 *   `web`       — images from booking sites that list this property, for the
 *                 many homestays Hotelbeds does not carry. Matched on the full
 *                 hotel name and restricted to hotel-listing hosts, but still
 *                 second-hand, so the gallery labels them.
 *
 * Photos change far more slowly than prices, so the result keeps for a week.
 */
const CACHE_PREFIX = 'ft_hotel_photos_v2:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7

const EMPTY = { general: [], rooms: {}, source: 'none' }

function cacheKey(hotel) {
  return `${CACHE_PREFIX}${hotel.id}`
}

function readCache(hotel) {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(hotel)) || 'null')
    return cached && Date.now() - cached.ts < CACHE_TTL_MS ? cached.gallery : null
  } catch {
    return null
  }
}

function writeCache(hotel, gallery) {
  try {
    localStorage.setItem(cacheKey(hotel), JSON.stringify({ gallery, ts: Date.now() }))
  } catch { /* storage full or unavailable — the next visit re-fetches */ }
}

/**
 * Returns `{ general, rooms, source }`. Always resolves: a hotel with no
 * gallery is a normal outcome, not an error, and the page falls back to the
 * single cover photo.
 */
export async function fetchHotelGallery(hotel) {
  if (!hotel?.id || !hasSupabase) return EMPTY

  const cached = readCache(hotel)
  if (cached) return cached

  try {
    const { data, error } = await supabase.functions.invoke('hotel-photos', {
      body: {
        hotelbedsCode: hotel.hotelbedsCode ?? null,
        roomCodes: (hotel.rooms ?? []).map((room) => room.code).filter(Boolean),
        name: hotel.name,
        // The matcher strips city words from the name before comparing, so it
        // needs the city alone — a full street address would strip half the
        // name of a hotel that happens to share a word with its street.
        cityName: cityFromAddress(hotel.address ?? hotel.area ?? ''),
      },
      signal: AbortSignal.timeout(20000),
    })
    if (error || data?.status !== 'ok') return EMPTY
    const gallery = {
      general: data.general ?? [],
      rooms: data.rooms ?? {},
      source: data.source ?? 'none',
    }
    if (gallery.general.length || Object.keys(gallery.rooms).length) writeCache(hotel, gallery)
    return gallery
  } catch {
    return EMPTY
  }
}
