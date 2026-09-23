// KartaView — open, crowd-sourced street-level imagery (CC-BY-SA).
//
// This is the keyless 360° source. Google Street View has far better Vietnamese
// coverage, but its Embed API needs a Cloud project with a billing account;
// KartaView's read API needs nothing at all, so it is what runs by default.
//
// The trade-off is coverage: measured over 400 m around eight FoodTrip cities,
// Ho Chi Minh City and Nha Trang are well covered, Ha Noi / Hoi An / Hue are
// thin, and Da Nang and Da Lat had no imagery at all. Callers must handle a
// null result as the normal case, not an error.
//
// Attribution is required by the licence — always render `attribution` and
// `pageUrl` alongside the panorama.

const API_URL = 'https://api.openstreetcam.org/2.0/photo/'
const CACHE_PREFIX = 'ft_kartaview_v3:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7

// Searched a little wider than the accuracy threshold so the UI can tell the
// traveller how far the nearest frame actually is instead of just "none".
// One request per lookup — the anonymous API allows 100 an hour.
const SEARCH_RADIUS_M = 300

/**
 * How close a panorama must be before it is worth showing.
 *
 * KartaView's frames come from whoever happened to drive past, so "nearest"
 * can easily be a different street. Measured distance to the nearest 360°
 * frame for real venues: Bến Thành 104 m, Bùi Viện 104 m, Nha Trang 148 m,
 * Cơm Tấm Ba Ghiền 169 m, Ốc Bà Già 183 m, Chùa Cầu 251 m, Đại Nội 276 m,
 * Hồ Gươm 303 m, Bún Chả Hương Liên 369 m, Cầu Rồng 428 m.
 *
 * At 150 m you are still on the venue's block in a dense Vietnamese city;
 * beyond that the panorama shows a street the traveller did not ask about, so
 * the caller falls back to a Google Maps link instead of showing it.
 */
export const ACCURATE_WITHIN_M = 150

function cacheKey(lat, lng) {
  return `${CACHE_PREFIX}${lat.toFixed(4)},${lng.toFixed(4)}`
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const { data, ts } = JSON.parse(raw)
    return Date.now() - ts < CACHE_TTL_MS ? data : undefined
  } catch {
    return undefined
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* private mode or quota — the lookup still worked */ }
}

function metresBetween(a, b) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// Which file is the real sphere is not obvious, and getting it wrong is not
// visibly obvious either — a flat frame stretched over a sphere still looks
// like a street. Measured across five cities:
//
//   th / lth / proc        1280x720 .. 2560x1440, ratio 1.78  — flat, NOT a sphere
//   wrapped_proc          13000x6500,  ratio 2.00             — the true equirect, 41 MB
//
// So the sphere is the only usable source and it is far too heavy to serve
// directly. KartaView's CDN is an imgproxy instance, and inserting a resize
// operation after its preset brings the same 2:1 image down to ~1 MB.
const CDN_RESIZE = 'rs:fit:4096:2048'

function panoramaUrl(photo) {
  const cdn = photo.imageProcUrl
  if (cdn && cdn.includes('/pr:sharp/')) return cdn.replace('/pr:sharp/', `/pr:sharp/${CDN_RESIZE}/`)
  // No CDN link in the payload — fall back to the raw sphere rather than to a
  // flat frame, since a wrong projection is worse than a slow one.
  return photo.fileurlProc || null
}

function shapePhoto(photo, origin) {
  const lat = Number(photo.lat)
  const lng = Number(photo.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const url = panoramaUrl(photo)
  if (!url) return null
  const distanceM = Math.round(metresBetween(origin, { lat, lng }))
  return {
    id: String(photo.id),
    imageUrl: url,
    thumbnailUrl: photo.fileurlTh || null,
    location: { lat, lng },
    distanceM,
    // Whether it is close enough to actually show — see ACCURATE_WITHIN_M.
    accurate: distanceM <= ACCURATE_WITHIN_M,
    // Point the viewer the way the camera was facing rather than due north.
    heading: Number(photo.heading) || 0,
    capturedAt: (photo.shotDate || photo.dateAdded || '').slice(0, 10) || null,
    pageUrl: photo.sequenceId ? `https://kartaview.org/details/${photo.sequenceId}/${photo.sequenceIndex ?? 0}` : 'https://kartaview.org',
    attribution: 'KartaView · CC BY-SA',
  }
}

async function fetchPhotos(lat, lng, radiusM, signal) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radiusM), itemsPerPage: '50' })
  const response = await fetch(`${API_URL}?${params}`, { signal })
  if (!response.ok) throw new Error(`KartaView ${response.status}`)
  const json = await response.json()
  return json?.result?.data ?? []
}

/**
 * The nearest 360° panorama to a point, or null when the area has none.
 *
 * Only `fieldOfView === '360'` frames are usable — KartaView also holds plenty
 * of ordinary forward-facing dashcam shots, which would look broken in a
 * panorama viewer.
 */
export async function findNearbyPanorama(location, { signal } = {}) {
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const key = cacheKey(lat, lng)
  const cached = readCache(key)
  if (cached !== undefined) return cached

  const origin = { lat, lng }
  let photos
  try {
    photos = await fetchPhotos(lat, lng, SEARCH_RADIUS_M, signal)
  } catch {
    return null
  }
  const best = photos
    .filter((photo) => String(photo.fieldOfView) === '360')
    .map((photo) => shapePhoto(photo, origin))
    .filter(Boolean)
    .sort((a, b) => a.distanceM - b.distanceM)[0] ?? null

  // A miss is cached too — most misses are "this area has no imagery", which
  // will not change between two page views.
  writeCache(key, best)
  return best
}
