import { normalizeSearchText } from './relevance.ts'

/**
 * Shared shaping for Serper's Google Maps results, used by both the
 * single-place lookup (`place-details`) and the area search
 * (`map-place-search`) so the two can never disagree about what a place is.
 */

export type SerperPlace = {
  title?: string
  address?: string
  latitude?: number
  longitude?: number
  rating?: number
  ratingCount?: number
  type?: string
  types?: string[]
  phoneNumber?: string
  website?: string
  priceLevel?: string
  openingHours?: Record<string, string>
  thumbnailUrl?: string
  cid?: string
  placeId?: string
}

// Serper localises the opening-hours keys to the `hl` we request, so the client
// would otherwise have to parse Vietnamese day names to work out whether a
// place is open. Resolving them to JS weekday numbers here keeps that logic in
// one place.
const WEEKDAY_INDEX: Record<string, number> = {
  'chu nhat': 0, 'thu hai': 1, 'thu ba': 2, 'thu tu': 3,
  'thu nam': 4, 'thu sau': 5, 'thu bay': 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

/** `{ 'Thứ Hai': '08:00–20:30' }` → `[{ weekday: 1, label, open: '08:00', close: '20:30' }]`. */
export function normaliseHours(hours: Record<string, string> | undefined) {
  if (!hours) return null
  const rows = Object.entries(hours).flatMap(([label, value]) => {
    const weekday = WEEKDAY_INDEX[normalizeSearchText(label)]
    if (weekday == null) return []
    // Google uses an en dash here, and writes "Đóng cửa" for a closed day.
    const match = String(value).match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/)
    return [{ weekday, label, raw: String(value), open: match?.[1] ?? null, close: match?.[2] ?? null }]
  })
  if (!rows.length) return null
  // Monday first, the way an opening-hours table is normally read.
  return rows.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
}

export function shapePlace(place: SerperPlace) {
  return {
    name: place.title ?? null,
    address: place.address ?? null,
    category: place.type ?? null,
    categories: place.types ?? [],
    rating: typeof place.rating === 'number' ? place.rating : null,
    ratingCount: typeof place.ratingCount === 'number' ? place.ratingCount : null,
    phone: place.phoneNumber ?? null,
    website: place.website ?? null,
    priceLevel: place.priceLevel ?? null,
    hours: normaliseHours(place.openingHours),
    thumbnailUrl: place.thumbnailUrl ?? null,
    // Deep-links to the exact listing rather than to a name search.
    mapsUrl: place.cid ? `https://www.google.com/maps?cid=${place.cid}` : null,
    placeId: place.placeId ?? place.cid ?? null,
    location: place.latitude != null && place.longitude != null
      ? { lat: place.latitude, lng: place.longitude }
      : null,
  }
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export async function callSerperMaps(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch('https://google.serper.dev/maps', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Serper ${response.status}: ${(await response.text()).slice(0, 180)}`)
  return await response.json() as { places?: SerperPlace[] }
}
