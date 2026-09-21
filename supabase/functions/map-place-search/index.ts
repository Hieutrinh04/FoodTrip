import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { callSerperMaps, haversineKm, shapePlace } from '../_shared/serperPlace.ts'

/**
 * Searches Google's Maps data for every place of a kind around a point.
 *
 * The app's basemap provider is built on OpenStreetMap, whose Vietnamese POI
 * coverage is far thinner than Google's — a residential street with a dozen
 * cafés on it can come back empty. This endpoint is what lets the map show the
 * same places a traveller would see in Google Maps, while FoodTrip still scores
 * them with its own model.
 *
 * Each page costs 3 Serper credits, so the caller asks for as few as it can and
 * the client caches per area.
 */

const MAX_PAGES = 3
const RESULTS_PER_PAGE = 20

// Beyond this the results stop being "around here" and start being the rest of
// the city, which the traveller did not ask for.
const MAX_RADIUS_KM = 8

// When the caller names an area instead of giving coordinates, Google matches
// on words as well as place: "quán cà phê Hội An" returned a café in Hà Nội
// called "An Hội An Cà Phê". One such outlier is enough to blow the map's
// viewport out to the whole country, so results far from where the bulk of them
// sit are dropped.
const MAX_SPREAD_FROM_MEDIAN_KM = 30

/** Centre of a result set, unmoved by a few far-flung outliers. */
function medianCentre(points: { lat: number; lng: number }[]) {
  const middle = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const i = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2
  }
  return { lat: middle(points.map((p) => p.lat)), lng: middle(points.map((p) => p.lng)) }
}

/**
 * Serper takes a zoom level rather than a radius. These are the zooms whose
 * viewport roughly matches the requested radius — higher zoom searches a
 * tighter area and returns denser, more local results.
 */
function zoomForRadius(km: number) {
  if (km <= 0.75) return 17
  if (km <= 1.5) return 16
  if (km <= 3) return 15
  if (km <= 6) return 14
  return 13
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight

  const params = new URL(request.url).searchParams
  const query = params.get('q')?.trim()
  const rawLat = params.get('lat')
  const rawLng = params.get('lng')
  if (!query) return jsonResponse({ error: 'missing-q' }, { status: 400 })

  const lat = Number(rawLat)
  const lng = Number(rawLng)
  // Read the raw params first: Number(null) is 0, and 0 is finite, so a missing
  // coordinate would otherwise silently search the Atlantic.
  // Coordinates are optional: without them Google resolves the place name in
  // the query itself, which is more reliable for a whole city than geocoding
  // the city name ourselves — that once put "Hà Nội" 50km out in Ba Vì.
  const origin = rawLat && rawLng && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  const radiusKm = Math.min(Math.max(Number(params.get('radiusKm')) || 3, 0.3), MAX_RADIUS_KM)
  const pages = Math.min(Math.max(Number(params.get('pages')) || 2, 1), MAX_PAGES)

  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) return jsonResponse({ status: 'no-key', places: [] })

  try {
    const zoom = zoomForRadius(radiusKm)
    const locationBias = origin ? { ll: `@${origin.lat},${origin.lng},${zoom}z` } : {}
    // Pages are independent requests, so they run together rather than in
    // sequence — three sequential round trips is a visible pause.
    const failures: string[] = []
    const responses = await Promise.all(
      Array.from({ length: pages }, (_, index) =>
        callSerperMaps(apiKey, {
          q: query,
          ...locationBias,
          gl: 'vn',
          hl: 'vi',
          page: index + 1,
          num: RESULTS_PER_PAGE,
        }).catch((error) => {
          // A page failing used to be indistinguishable from a page returning
          // nothing, so an expired key or an exhausted credit balance surfaced
          // as "no places here" — the one explanation the traveller can do
          // nothing about, and the one hardest to diagnose from the outside.
          failures.push((error as Error).message)
          return { places: [] }
        })
      )
    )
    if (failures.length === pages) {
      console.error('map-place-search: every Serper page failed:', failures[0])
      // Deliberately a 200: the client's existing `status !== 'ok'` branch can
      // then show why the map is empty, whereas a 5xx is swallowed by
      // functions.invoke as a generic transport error with no message.
      return jsonResponse({ status: 'provider-error', places: [], message: failures[0] })
    }

    const seen = new Set<string>()
    const places = responses
      .flatMap((response) => response.places ?? [])
      .flatMap((raw) => {
        const place = shapePlace(raw)
        if (!place.name || !place.location) return []
        // Pages overlap, and the same business can appear under two ids, so
        // dedupe on identity first and on name+position second.
        const key = place.placeId ?? `${place.name}@${place.location.lat.toFixed(5)},${place.location.lng.toFixed(5)}`
        if (seen.has(key)) return []
        seen.add(key)

        // Without a centre there is nothing to measure from, and nothing to
        // filter by: the query itself already named the area.
        if (!origin) return [{ ...place, distanceKm: null }]
        const distanceKm = haversineKm(origin, place.location)
        // Google widens the search on its own when an area is sparse; results
        // from the next district over are not what "quán quanh đây" means.
        if (distanceKm > radiusKm) return []
        return [{ ...place, distanceKm }]
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))

    // With an explicit centre the radius filter above already did this job.
    const kept = origin || places.length < 3
      ? places
      : (() => {
          const centre = medianCentre(places.map((place) => place.location!))
          return places.filter((place) => haversineKm(centre, place.location!) <= MAX_SPREAD_FROM_MEDIAN_KM)
        })()

    return jsonResponse({ status: 'ok', places: kept, radiusKm, credits: pages * 3 })
  } catch (error) {
    console.error('map-place-search failed:', (error as Error).message)
    return jsonResponse({ status: 'error', places: [] }, { status: 502 })
  }
})
