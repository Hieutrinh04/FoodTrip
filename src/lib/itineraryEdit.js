import { fetchPlaceEnrichment } from './placesService.js'

const TRANSPORT_SPEED_KMH = { walk: 4.5, bike: 25, car: 28, taxi: 28 }

function haversineKm(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function formatDistance(km, transport) {
  if (km == null) {
    return { vi: 'Trong khu vực trung tâm', en: 'Within the city center' }
  }
  const speed = TRANSPORT_SPEED_KMH[transport] ?? 20
  const minutes = Math.max(1, Math.round((km / speed) * 60))
  const kmLabel = km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
  return { vi: `${kmLabel} · ${minutes} phút`, en: `${kmLabel} · ${minutes} min` }
}

/** Recomputes each stop's `distance` from its predecessor's real location — call after any reorder/replace. */
export function recomputeDistances(stops, transport) {
  let prevLocation = null
  return stops.map((stop) => {
    const distance = formatDistance(prevLocation && stop.location ? haversineKm(prevLocation, stop.location) : null, transport)
    if (stop.location) prevLocation = stop.location
    return { ...stop, distance }
  })
}

/**
 * Applies a drag-reorder: the dragged stops carry their place data
 * (placeId/location/rating/etc.) to their new position, but `time`/`note`
 * stay attached to the *position* (taken from whichever stop originally
 * occupied that slot) — so the day's schedule always reads in a sensible,
 * strictly increasing time order regardless of how places get shuffled.
 */
export function applyReorder(originalStops, newOrderStops, transport) {
  const timeNoteByIndex = originalStops.map((s) => ({ time: s.time, note: s.note }))
  const reassigned = newOrderStops.map((stop, i) => ({
    ...stop,
    time: timeNoteByIndex[i]?.time ?? stop.time,
    note: timeNoteByIndex[i]?.note ?? stop.note,
  }))
  return recomputeDistances(reassigned, transport)
}

/** Candidate places to swap into a stop: same category, not already used elsewhere in the trip. */
export function getReplacementCandidates({ candidatePlaces, category, usedPlaceIds }) {
  return candidatePlaces
    .filter((p) => p.category === category && !usedPlaceIds.has(p.id))
    .sort((a, b) => (b.liveRating ?? b.rating ?? 0) - (a.liveRating ?? a.rating ?? 0))
}

/**
 * Swaps a stop's place while keeping its time/note slot — best-effort
 * fetches live Google rating/location for the new place (curated places
 * don't carry that until enriched; custom-city places already have it from
 * citySearch.js). Distances are the caller's responsibility to recompute
 * afterward (a single swap can affect the next stop's distance too).
 */
export async function replaceStopPlace(stop, newPlace, cityId) {
  if (newPlace.googlePlaceId) {
    return {
      ...stop,
      placeId: newPlace.id,
      liveRating: newPlace.liveRating ?? null,
      liveReviewCount: newPlace.liveReviewCount ?? null,
      location: newPlace.location ?? null,
      googlePlaceId: newPlace.googlePlaceId,
    }
  }
  try {
    const enrichment = await fetchPlaceEnrichment({ name: newPlace.name.vi, address: newPlace.address.vi, city: cityId })
    return {
      ...stop,
      placeId: newPlace.id,
      liveRating: enrichment?.rating ?? null,
      liveReviewCount: enrichment?.userRatingCount ?? null,
      location: enrichment?.location ?? null,
      googlePlaceId: enrichment?.placeId ?? null,
    }
  } catch {
    return { ...stop, placeId: newPlace.id, liveRating: null, liveReviewCount: null, location: null, googlePlaceId: null }
  }
}

/** All place ids currently used anywhere in the itinerary (across all days). */
export function usedPlaceIdsIn(days) {
  return new Set(days.flat().map((s) => s.placeId))
}

/**
 * Tags every stop with a stable, unique `_uid` — needed once an itinerary
 * becomes editable, since drag-reorder (framer-motion's Reorder) and React
 * list keys both need per-instance identity, and `placeId` alone isn't
 * unique (the engine allows revisiting a place across slots when a city has
 * too few candidates). Call this once right after generation.
 */
export function withStopIds(days) {
  let n = 0
  return days.map((day) => day.map((stop) => ({ ...stop, _uid: stop._uid ?? `s${n++}` })))
}
