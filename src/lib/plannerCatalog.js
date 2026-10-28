import { getCity } from '../data/destinations.js'
import { fetchPlaceCatalog, mergePlaceCatalog } from './placeCatalog.js'
import { plain } from '../../supabase/functions/_shared/placeNames.js'

/** Destination is mandatory: never feed the whole national catalogue into one trip. */
export function placesForDestination(places, { cityId, destinationName } = {}) {
  const city = getCity(cityId)
  const names = [...new Set([destinationName, city?.name.vi, city?.name.en].filter(Boolean).map(plain))]
  if (!city && !names.length) return []
  return places.filter((p) => {
    if (city && p.city === city.id) return true
    // A specific indexed city must not leak into another city, even when its
    // address contains a merged province name (Hội An, Đà Nẵng).
    if (city && p.city && p.city !== city.id) return false
    const address = ` ${plain(p.address?.vi ?? '')} `
    return names.some((name) => address.includes(` ${name} `))
  })
}

export async function loadPlannerCatalog(destination, { load = fetchPlaceCatalog } = {}) {
  try { return { places: placesForDestination(await load(), destination), status: 'ready' } }
  catch { return { places: [], status: 'error' } }
}

export function plannerPool(base, stored) {
  return mergePlaceCatalog(base, stored).map((p) => ({
    ...p,
    // Planner/editor read these existing field names. Keep Google facts separate
    // from seed scores and never synthesize a price or opening window.
    liveRating: p.googleRating ?? p.liveRating ?? null,
    liveReviewCount: p.googleRatingCount ?? p.liveReviewCount ?? null,
    tags: [...new Set([...(p.tags ?? []), ...(p.category === 'cafe' ? ['coffee'] : [])])],
  }))
}
