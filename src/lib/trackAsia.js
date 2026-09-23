// Track-Asia map platform client — replaces the previous Google Maps
// integration. Track-Asia is a Vietnamese map service built on OpenStreetMap
// data, with a generous free quota (50k geocode requests/day) and no billing
// risk, which is why this project migrated to it.
//
// What Track-Asia provides vs what Google Places provided:
//   ✓ place search by text, real names, addresses, coordinates, place_id
//   ✓ reverse geocoding, routing (OSRM-compatible), vector map tiles
//   ✗ ratings, review counts, opening hours, photos — none of these exist.
// Callers must degrade gracefully: ratings fall back to the curated seed
// dataset, opening hours default to "always open", and photos fall back to
// the themed gradient placeholders.

const apiKey = import.meta.env.VITE_TRACK_ASIA_API_KEY || ''

/** Kept under the old name so every `if (!hasMapsKey)` guard in the app still reads the same. */
export const hasMapsKey = Boolean(apiKey)

const GEOCODE_URL = 'https://maps.track-asia.com/api/v2/geocode/json'
const STYLE_URL = 'https://maps.track-asia.com/styles/v1/streets.json'
const ROUTE_URL = 'https://maps.track-asia.com/route/v1'
const ROUTE_TIMEOUT_MS = 6000
const STYLE_TIMEOUT_MS = 8000
const ROUTE_CACHE_TTL_MS = 1000 * 60 * 5

async function fetchWithTimeout(url, timeoutMs, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

/** MapLibre style URL — the style already embeds the key for its own glyph/sprite/tile sources. */
export function mapStyleUrl() {
  return `${STYLE_URL}?key=${apiKey}`
}

// Track-Asia exposes three tile paths and only one carries the full basemap:
//   tiles.track-asia.com/tiles/v1/…    → landcover, landuse, roads, contours
//                                        (~44 KB/tile)  ← the real basemap
//   maps.track-asia.com/api/v2/tiles/… → poi_label only, no geometry, so a map
//                                        built on it renders blank
//   maps.track-asia.com/tiles/v1/…     → answers 200 with the website's HTML,
//                                        never a tile
// The tile host occasionally answers 400 for a moment; MapLibre retries, so
// that resolves itself rather than needing a fallback host.
const TILE_TEMPLATE = 'https://tiles.track-asia.com/tiles/v1/{z}/{x}/{y}.pbf'
const LABEL_ONLY_TILE_HOST = 'https://maps.track-asia.com/api/v2/tiles'

let stylePromise = null
const LITE_MAP_SOURCE_LAYERS = new Set(['admin', 'building', 'landcover', 'landuse', 'landuse_overlay', 'road', 'structure', 'water', 'waterway'])

/**
 * Fetches the Track-Asia MapLibre style and repoints its vector tile source at
 * the tile path that actually serves tiles (see TILE_TEMPLATE above). Rewriting
 * the source to an explicit template also skips the TileJSON round-trip the
 * original `url` form needs.
 *
 * The resolved style is shared between map instances, so each caller gets a
 * clone — MapLibre mutates the style object it is handed.
 */
export async function loadMapStyle({ lightweight = false } = {}) {
  if (!hasMapsKey) return null
  if (!stylePromise) {
    stylePromise = (async () => {
      const res = await fetchWithTimeout(mapStyleUrl(), STYLE_TIMEOUT_MS)
      if (!res.ok) throw new Error(`track-asia style ${res.status}`)
      const style = await res.json()
      for (const source of Object.values(style.sources ?? {})) {
        if (source.type !== 'vector') continue
        delete source.url
        source.tiles = [`${TILE_TEMPLATE}?key=${apiKey}`]
        source.minzoom ??= 0
        source.maxzoom ??= 16
        source.attribution ??= '<a href="https://track-asia.com/">TrackAsia</a> · OpenStreetMap'
      }
      return style
    })().catch((err) => {
      stylePromise = null
      throw err
    })
  }
  const style = structuredClone(await stylePromise)
  if (lightweight) {
    // The itinerary map already renders its own numbered markers. Dropping 50+
    // symbol/POI layers avoids sprite, glyph and missing-icon requests while
    // preserving the geographic context needed to understand the route.
    style.layers = (style.layers ?? []).filter((layer) =>
      layer.type === 'background' || (layer.type !== 'symbol' && LITE_MAP_SOURCE_LAYERS.has(layer['source-layer']))
    )
    delete style.sprite
    delete style.glyphs
  }
  return style
}

/** Safety net: keep any stray label-only tile URL off the map. */
export function mapRequestTransform(url) {
  if (url.startsWith(LABEL_ONLY_TILE_HOST)) {
    return { url: url.replace(LABEL_ONLY_TILE_HOST, 'https://tiles.track-asia.com/tiles/v1') }
  }
  return { url }
}

function normalizeResult(r) {
  const loc = r.geometry?.location
  return {
    id: r.place_id ?? null,
    name: r.name || r.formatted_address || '',
    address: r.formatted_address ?? '',
    location: loc && typeof loc.lat === 'number' ? { lat: loc.lat, lng: loc.lng } : null,
    types: r.types ?? [],
  }
}

async function geocodeRequest(params) {
  const query = new URLSearchParams({ ...params, key: apiKey, new_admin: 'true' })
  const res = await fetch(`${GEOCODE_URL}?${query}`)
  if (!res.ok) throw new Error(`track-asia geocode ${res.status}`)
  const json = await res.json()
  if (json.status !== 'OK') return []
  return (json.results || []).map(normalizeResult).filter((r) => r.location)
}

/**
 * Free-text place search ("quán ăn ngon Hội An"). Returns null when no key is
 * configured so callers can show their existing no-key state.
 *
 * Note: Track-Asia ignores `location`/`radius` bias parameters — passing
 * coordinates does not restrict results to that area — so any
 * proximity filtering has to be done client-side against the returned
 * coordinates (see searchNearbyByCoords).
 */
export async function searchPlaces(query, { limit = 20 } = {}) {
  if (!hasMapsKey || !query?.trim()) return null
  const results = await geocodeRequest({ address: query.trim() })
  return results.slice(0, limit)
}

/** Looks a single place up by its Track-Asia place_id. */
export async function lookupPlace(placeId) {
  if (!hasMapsKey || !placeId) return null
  const results = await geocodeRequest({ place_id: placeId })
  return results[0] ?? null
}

/** Reverse geocodes coordinates into an address plus a best-guess area name to search within. */
export async function reverseGeocode({ lat, lng }) {
  if (!hasMapsKey || lat == null || lng == null) return null
  const results = await geocodeRequest({ latlng: `${lat},${lng}` })
  const first = results[0]
  if (!first) return null
  // The address reads "street, ward, city" — the last one or two components
  // are the widest area, which is what a text search should be scoped to.
  const parts = first.address.split(',').map((s) => s.trim()).filter(Boolean)
  return { address: first.address, areaName: parts.slice(-2).join(', ') || first.address }
}

export function haversineKm(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * Proximity search: reverse-geocodes the origin to learn what area it's in,
 * runs a text search scoped to that area, then filters/sorts by real distance.
 * This two-step dance is needed because the API has no radius parameter.
 */
export async function searchNearbyByCoords(origin, { keyword = 'quán ăn', radiusKm = 5, limit = 20 } = {}) {
  if (!hasMapsKey || !origin) return null
  const area = await reverseGeocode(origin)
  if (!area) return []
  const results = (await searchPlaces(`${keyword} ${area.areaName}`, { limit: 50 })) ?? []
  return results
    .map((r) => ({ ...r, distanceKm: haversineKm(origin, r.location) }))
    .filter((r) => r.distanceKm != null && r.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

// Track-Asia's OSRM service only serves these three profiles (bike/foot 404).
const ROUTE_PROFILE = { bike: 'motorcycle', car: 'car', walk: 'walking', taxi: 'car' }
const routeDetailsCache = new Map()

/**
 * Full road-route result for an already ordered list of points.
 *
 * Track-Asia exposes the OSRM route shape, total distance/time and one leg per
 * pair of consecutive waypoints. Keeping all three matters: the map needs the
 * geometry, while the planner must use the same road distance/time instead of
 * showing a straight-line estimate beside a road-following line.
 */
export async function fetchRouteDetails(points, transport = 'car', { geometry = true } = {}) {
  if (!hasMapsKey || !points || points.length < 2) return null
  const profile = ROUTE_PROFILE[transport] ?? 'car'
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const cacheKey = `${profile}:${geometry ? 'geometry' : 'metrics'}:${coords}`
  const cached = routeDetailsCache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < ROUTE_CACHE_TTL_MS) return cached.promise

  const promise = (async () => {
    try {
      const overview = geometry ? 'full' : 'false'
      const res = await fetchWithTimeout(
        `${ROUTE_URL}/${profile}/${coords}?key=${apiKey}&overview=${overview}&geometries=geojson&steps=false`,
        ROUTE_TIMEOUT_MS
      )
      if (!res.ok) return null
      const json = await res.json()
      if (json.code !== 'Ok') return null
      const route = json.routes?.[0]
      if (!route) return null
      return {
        geometry: route.geometry ?? null,
        distanceMeters: Number.isFinite(route.distance) ? route.distance : null,
        durationSeconds: Number.isFinite(route.duration) ? route.duration : null,
        legs: (route.legs ?? []).map((leg) => ({
          distanceMeters: Number.isFinite(leg.distance) ? leg.distance : null,
          durationSeconds: Number.isFinite(leg.duration) ? leg.duration : null,
        })),
      }
    } catch {
      return null
    }
  })()
  routeDetailsCache.set(cacheKey, { createdAt: Date.now(), promise })
  const result = await promise
  if (!result) routeDetailsCache.delete(cacheKey)
  return result
}

/** Route geometry between ordered points as GeoJSON. Null if routing fails. */
export async function fetchRoute(points, transport = 'car') {
  return (await fetchRouteDetails(points, transport))?.geometry ?? null
}

/** Opens the place on Track-Asia's own web map — the equivalent of the old "view on Google Maps" links. */
export function placeMapUrl({ name, address, location }) {
  if (location) return `https://maps.track-asia.com/?lat=${location.lat}&lng=${location.lng}&zoom=17`
  return `https://maps.track-asia.com/?q=${encodeURIComponent([name, address].filter(Boolean).join(', '))}`
}

// The basemap draws its own POI icons — hotels, restaurants, pharmacies — from
// this source layer. On a results map they compete with the app's own scored
// markers and duplicate them: filtering for cafés still left the map covered in
// hotel and restaurant pins the filter had nothing to do with.
const BASEMAP_POI_SOURCE_LAYERS = new Set(['poi_label', 'poi'])

/**
 * Hides the basemap's built-in place icons, leaving roads, water and district
 * names intact so the map still reads as a map.
 *
 * Matches on the source layer rather than the layer id: ids are the style
 * author's naming choice and change without notice, whereas the source layer
 * comes from the tile schema.
 */
export function hideBasemapPoiLayers(map) {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== 'symbol' || !BASEMAP_POI_SOURCE_LAYERS.has(layer['source-layer'])) continue
    // A style can be swapped underneath us mid-load, so a missing layer here is
    // expected rather than exceptional.
    if (map.getLayer(layer.id)) map.setLayoutProperty(layer.id, 'visibility', 'none')
  }
}
