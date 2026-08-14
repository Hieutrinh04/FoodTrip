import { haversineKm } from './trackAsia.js'

/**
 * Prepares a route polyline for smooth playback: precomputes each segment's
 * length so a position can be looked up by "distance travelled" rather than by
 * array index, which is what keeps the vehicle moving at an even speed instead
 * of jumping between densely- and sparsely-spaced coordinates.
 *
 * `coordinates` is a GeoJSON LineString coordinate array ([lng, lat] pairs).
 */
export function buildRouteWalker(coordinates) {
  const segments = []
  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    const from = coordinates[i - 1]
    const to = coordinates[i]
    const length = haversineKm({ lat: from[1], lng: from[0] }, { lat: to[1], lng: to[0] }) ?? 0
    if (length <= 0) continue
    segments.push({ from, to, start: total, length })
    total += length
  }

  /** Position (and heading) at a fraction 0–1 of the way along the route. */
  function at(progress) {
    if (!segments.length) return { position: coordinates[0] ?? [0, 0], bearing: 0 }
    const target = Math.max(0, Math.min(1, progress)) * total
    const segment = segments.find((s) => target <= s.start + s.length) ?? segments[segments.length - 1]
    const ratio = (target - segment.start) / segment.length
    const position = [
      segment.from[0] + (segment.to[0] - segment.from[0]) * ratio,
      segment.from[1] + (segment.to[1] - segment.from[1]) * ratio,
    ]
    return { position, bearing: bearingBetween(segment.from, segment.to) }
  }

  return { totalKm: total, at }
}

/** Compass bearing in degrees from one [lng, lat] to another — used to point the vehicle marker. */
function bearingBetween(from, to) {
  const toRad = (d) => (d * Math.PI) / 180
  const lat1 = toRad(from[1])
  const lat2 = toRad(to[1])
  const dLng = toRad(to[0] - from[0])
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Runs `onFrame(progress)` from 0 to 1 over `durationMs`, driven by
 * requestAnimationFrame. Returns a stop function; call it on unmount or when
 * the user pauses, otherwise the loop keeps running against a dead map.
 */
export function playRoute({ durationMs, onFrame, onDone }) {
  let frameId = null
  let stopped = false
  const startedAt = performance.now()

  function step(now) {
    if (stopped) return
    const progress = Math.min(1, (now - startedAt) / durationMs)
    onFrame(progress)
    if (progress < 1) {
      frameId = requestAnimationFrame(step)
    } else {
      onDone?.()
    }
  }
  frameId = requestAnimationFrame(step)

  return () => {
    stopped = true
    if (frameId != null) cancelAnimationFrame(frameId)
  }
}
