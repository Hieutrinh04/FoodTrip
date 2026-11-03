// What FoodTrip has in each city: venues people kept (place_city_counts, real
// rows in the database) and the curated sample places that ship with the app.
// The two are always shown apart, as Explore does — a sample entry is not a
// venue anyone saved.

import { supabase, hasSupabase } from './supabaseClient.js'
import { cityIdOf } from './placeCatalog.js'
import { getPlacesByCity } from '../data/destinations.js'

/**
 * Kept venues per city id, e.g. { hanoi: 17, hue: 7 }. Null when the backend
 * or the function is unavailable — the page then shows no figure rather than
 * a zero that is not true.
 */
// One read per page load: the home grid and a city page ask for the same numbers.
let shared = null
export function fetchCityCounts({ rpc } = {}) {
  if (rpc !== undefined) return readCityCounts(rpc)
  shared ??= readCityCounts(hasSupabase ? () => supabase.rpc('place_city_counts') : null)
  return shared
}

async function readCityCounts(rpc) {
  if (!rpc) return null
  try {
    const { data, error } = await rpc()
    if (error || !Array.isArray(data)) return null
    const counts = {}
    for (const row of data) {
      const id = cityIdOf({ city: row.city })
      const n = Number(row.places)
      if (id && Number.isFinite(n) && n > 0) counts[id] = (counts[id] ?? 0) + n
    }
    return counts
  } catch {
    return null
  }
}

/** The curated sample places of a city: eateries, and the sights apart. */
export const sampleEateries = (cityId) => getPlacesByCity(cityId).filter((p) => ['food', 'cafe'].includes(p.category))
export const sampleSights = (cityId) => getPlacesByCity(cityId).filter((p) => p.category === 'attraction')

// Google's rating, weighted by how many people gave it (4.9★ from 3 reviews ranks below 4.6★ from 900).
const trusted = (p) => (p.googleRating ?? 0) * ((p.googleRatingCount ?? 0) / ((p.googleRatingCount ?? 0) + 20))

// Google's own type for the venue ("Nhà hàng Việt Nam", "Quán cà phê"). The
// catalogue files anything it does not recognise under food, which lets a
// lagoon or a shopping street into a list of "quán"; here the type must say so.
const EATERY_TYPE = /nhà hàng|quán|restaurant|cà phê|caf[eé]|coffee|ăn|bánh|bún|phở|cơm|food|bar|pub|bistro|tiệm|trà|tea|kem|ẩm thực|lẩu|nướng|hải sản|chay|bakery|dessert/i
export const isEatery = (p) => ['food', 'cafe'].includes(p.category) && EATERY_TYPE.test(p.shortDesc?.vi ?? '')

/** The best-rated kept eateries of a city, from the public catalogue. */
export function topCatalogPlaces(catalog, cityId, limit = 6) {
  return (catalog ?? []).filter((p) => p.city === cityId && p.googleRating != null && isEatery(p))
    .sort((a, b) => trusted(b) - trusted(a)).slice(0, limit)
}
