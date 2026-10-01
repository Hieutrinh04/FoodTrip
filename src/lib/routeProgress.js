// Where a traveller is along a route, for turn-by-turn style following: the
// nearest point of the route to a GPS fix, how far off the route the fix is,
// and how much of the route is behind and ahead of them.
//
// Coordinates are GeoJSON order, [lng, lat]. Distances are metres. Over the
// few kilometres of a city route a flat projection around the fix is accurate
// to well under a metre, which is far below GPS noise.

const EARTH_RADIUS_M = 6371008.8
const toRad = (deg) => (deg * Math.PI) / 180

/** Great-circle distance between two { lat, lng } points, in metres. */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Compass bearing from one { lat, lng } point to another, 0–360°, 0 = north. */
export function bearingDegrees(from, to) {
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat))
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat))
    - Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const asPoint = ([lng, lat]) => ({ lat, lng })

/**
 * The point of the route nearest to `point`:
 * - `segmentIndex`, `t`: on the segment coords[i] → coords[i + 1], t of the way along
 * - `snapped`: that point, [lng, lat]
 * - `offRouteMeters`: how far the fix is from it
 * - `alongMeters`, `totalMeters`: distance covered so far, and the route's length
 * Null for a route with fewer than two points.
 */
export function locateOnRoute(coords, point) {
  if (!Array.isArray(coords) || coords.length < 2) return null
  const cosLat = Math.cos(toRad(point.lat))
  const project = ([lng, lat]) => [toRad(lng - point.lng) * cosLat * EARTH_RADIUS_M, toRad(lat - point.lat) * EARTH_RADIUS_M]

  let best = null
  let covered = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const segmentLength = distanceMeters(asPoint(coords[i]), asPoint(coords[i + 1]))
    const [ax, ay] = project(coords[i])
    const [bx, by] = project(coords[i + 1])
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy
    // The fix is the origin of the projection, so its offset from A is -A.
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / lengthSq))
    const off = Math.hypot(ax + t * dx, ay + t * dy)
    if (!best || off < best.offRouteMeters) {
      best = { segmentIndex: i, t, offRouteMeters: off, alongMeters: covered + t * segmentLength }
    }
    covered += segmentLength
  }
  const [lng1, lat1] = coords[best.segmentIndex]
  const [lng2, lat2] = coords[best.segmentIndex + 1]
  return {
    ...best,
    snapped: [lng1 + (lng2 - lng1) * best.t, lat1 + (lat2 - lat1) * best.t],
    totalMeters: covered,
  }
}

/** The route cut at a located point: the part already travelled and the part ahead. */
export function splitRoute(coords, located) {
  if (!located) return { passed: [], remaining: coords ?? [] }
  const cut = located.segmentIndex + 1
  return {
    passed: [...coords.slice(0, cut), located.snapped],
    remaining: [located.snapped, ...coords.slice(cut)],
  }
}
