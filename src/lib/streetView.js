// Google Street View, embedded through the Maps Embed API.
//
// The app's basemap is Track-Asia (OpenStreetMap), which publishes no
// street-level imagery at all, so a 360° view has to come from elsewhere.
// The Embed API is the one Google surface that fits this project: it is a plain
// iframe with a browser key — no Maps JavaScript SDK, no Places billing, and
// none of the metered usage that made this app move off Google Maps in the
// first place.
//
// Set VITE_GOOGLE_MAPS_EMBED_KEY to a browser key with "Maps Embed API"
// enabled and an HTTP-referrer restriction. Without it every helper here
// returns null and the UI simply omits the 360° view.

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY || ''

export const hasStreetView = Boolean(apiKey)

/**
 * Embed URL for the panorama nearest to a point.
 *
 * `fov` is the zoom (smaller = more zoomed in); `heading` is the compass
 * bearing the view starts at and `pitch` its vertical angle. Google snaps to
 * the closest captured panorama, so a venue set back from the road still gets
 * the view from its street.
 */
export function streetViewEmbedUrl(location, { heading = 0, pitch = 0, fov = 90 } = {}) {
  if (!hasStreetView) return null
  const lat = location?.lat
  const lng = location?.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const params = new URLSearchParams({
    key: apiKey,
    location: `${lat},${lng}`,
    heading: String(heading),
    pitch: String(pitch),
    fov: String(fov),
  })
  return `https://www.google.com/maps/embed/v1/streetview?${params}`
}

/** Google Maps' own Street View page — the fallback when no key is configured. */
export function streetViewExternalUrl(location) {
  const lat = location?.lat
  const lng = location?.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
}
