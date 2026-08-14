import { hasMapsKey, searchNearbyByCoords, searchPlaces, haversineKm } from './trackAsia.js'

function toNearbyPlace(p, origin) {
  return {
    id: p.id,
    name: p.name,
    // Track-Asia carries no ratings or review counts — the UI shows the
    // distance and address instead of a star score.
    rating: null,
    userRatingCount: null,
    address: p.address,
    location: p.location,
    mapsUri: null,
    distanceKm: p.distanceKm ?? (origin && p.location ? haversineKm(origin, p.location) : null),
  }
}

/**
 * Finds real food places around a GPS point. Track-Asia's geocoder has no
 * radius parameter, so this reverse-geocodes the point to an area name,
 * searches within that area, then filters by true haversine distance.
 */
export async function searchNearbyFood(origin, radiusMeters = 2500) {
  if (!hasMapsKey) return null
  const results = await searchNearbyByCoords(origin, { keyword: 'quán ăn', radiusKm: radiusMeters / 1000 })
  if (results === null) return null
  return results.map((p) => toNearbyPlace(p, origin))
}

/**
 * Fallback for when GPS isn't available: passes a free-form query
 * (e.g. "địa điểm ăn sáng ở thủ dầu một") straight to the geocoder, which
 * already understands combined intent + location phrases.
 */
export async function searchFoodByText(textQuery, origin) {
  if (!hasMapsKey) return null
  const results = (await searchPlaces(textQuery, { limit: 20 })) ?? []
  return results
    .map((p) => toNearbyPlace(p, origin))
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
}

/** Best-effort silent geolocation lookup — resolves null instead of throwing on denial/timeout. */
export function tryGetLocation(timeout = 6000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    )
  })
}
