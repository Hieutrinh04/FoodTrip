// The database side of known venues for detect-place / verify-place: load the
// known_places and place_aliases lists (kept in memory for 10 minutes), give a
// known venue its coordinates the first time it is matched (one map search,
// then stored), and find venues people already confirmed for a video link.
// Service role over PostgREST with plain fetch; every failure degrades to
// "nothing known" rather than failing the request.

import { serperFetch, hasSerperKey } from './serper.ts'
import { shapePlace, type SerperPlace } from './serperPlace.ts'
import { coreName, plain, sameVenue } from './placeNames.js'
import { citiesIn } from './captionSignals.js'

export type KnownPlace = {
  place_id: string; name: string; core: string; address: string | null; city: string | null; lat: number | null; lng: number | null; confirmations: number
  // Google's details, once a search stored them (see saveFound).
  category?: string | null; rating?: number | null; rating_count?: number | null; hours?: unknown[] | null; thumbnail_url?: string | null; maps_url?: string | null; phone?: string | null; website?: string | null; price_level?: string | null
}
export type KnownAlias = { alias: string; place_id: string; hits: number }
/** A suggestion as the share page shows it (details when FoodTrip has them). */
export type Candidate = { placeId: string; name: string; address: string; location: { lat: number; lng: number }; known?: boolean } & Partial<Record<'category' | 'rating' | 'ratingCount' | 'hours' | 'thumbnailUrl' | 'mapsUrl' | 'phone' | 'website' | 'priceLevel', unknown>>

const TTL_MS = 10 * 60e3
let memory: { at: number; places: KnownPlace[]; aliases: KnownAlias[] } | null = null

function api() {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return url && key ? { url: `${url}/rest/v1`, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' } } : null
}

async function get<T>(path: string): Promise<T[]> {
  const a = api()
  if (!a) return []
  try {
    const res = await fetch(`${a.url}/${path}`, { headers: a.headers, signal: AbortSignal.timeout(4000) })
    return res.ok ? await res.json() : []
  } catch {
    return []
  }
}

export async function loadKnown() {
  if (memory && Date.now() - memory.at < TTL_MS) return memory
  const [places, aliases] = await Promise.all([
    get<KnownPlace>('known_places?select=place_id,name,core,address,city,lat,lng,confirmations,category,rating,rating_count,hours,thumbnail_url,maps_url,phone,website,price_level&limit=20000'),
    get<KnownAlias>('place_aliases?select=alias,place_id,hits&limit=50000'),
  ])
  memory = { at: Date.now(), places, aliases }
  return memory
}

/** The details stored for a known venue, in a suggestion's field names (only those it has). */
function knownDetails(place: KnownPlace) {
  const out: Record<string, unknown> = {
    category: place.category, rating: place.rating == null ? null : Number(place.rating), ratingCount: place.rating_count,
    hours: place.hours, thumbnailUrl: place.thumbnail_url, mapsUrl: place.maps_url, phone: place.phone, website: place.website, priceLevel: place.price_level,
  }
  for (const key of Object.keys(out)) if (out[key] == null) delete out[key]
  return out
}

/**
 * A known venue as a suggestion. One with no coordinates yet is looked up once
 * on the map (name + address), and the coordinates are stored for next time.
 */
export async function asCandidate(place: KnownPlace): Promise<Candidate | null> {
  if (place.lat != null && place.lng != null) {
    return { placeId: place.place_id, name: place.name, address: place.address ?? place.city ?? '', location: { lat: place.lat, lng: place.lng }, known: true, ...knownDetails(place) }
  }
  if (!hasSerperKey()) return null
  try {
    const res = await serperFetch('maps', { q: [place.name, place.address ?? place.city].filter(Boolean).join(', '), gl: 'vn', hl: 'vi', num: 3 }, 8000)
    if (!res.ok) return null
    const found = ((await res.json()).places ?? []).map((raw: SerperPlace) => shapePlace(raw))
      .find((p: ReturnType<typeof shapePlace>) => p.location && (p.placeId === place.place_id || sameVenue(place.name, p.name ?? '')))
    if (!found?.location) return null
    place.lat = found.location.lat; place.lng = found.location.lng
    const a = api()
    if (a) {
      fetch(`${a.url}/known_places?place_id=eq.${encodeURIComponent(place.place_id)}`, {
        method: 'PATCH', headers: { ...a.headers, prefer: 'return=minimal' },
        body: JSON.stringify({ lat: place.lat, lng: place.lng, address: place.address ?? found.address, updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {})
    }
    return { placeId: place.place_id, name: place.name, address: place.address ?? found.address ?? '', location: found.location, known: true }
  } catch {
    return null
  }
}

/** A venue as a search returns it (shapePlace), as far as storing it goes. */
export type FoundPlace = {
  placeId: string | null; name: string | null; address: string | null; location: { lat: number; lng: number } | null
  category?: string | null; rating?: number | null; ratingCount?: number | null; phone?: string | null; website?: string | null
  priceLevel?: string | null; hours?: unknown[] | null; thumbnailUrl?: string | null; mapsUrl?: string | null
}

const cut = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)
/** A link, kept only with its scheme: https for photos and Maps, http(s) for a venue's own website. */
const link = (value: unknown, max: number, scheme = /^https:\/\//i) => {
  const url = cut(value, max)
  return url && scheme.test(url) ? url : null
}

/**
 * Stores venues a search found, with Google's details, as FoodTrip's own venue
 * data. Only venues with Google's own id: a made-up "map:…" id names no venue
 * for sure. Rows a person confirmed keep their source and confirmations (those
 * columns are left out, so an existing row keeps its own). Best effort.
 */
export async function saveFound(found: FoundPlace[]) {
  const a = api()
  const rows = found
    .filter((p) => p.placeId && !p.placeId.startsWith('map:') && cut(p.name, 200) && p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng))
    .slice(0, 20)
    .map((p) => {
      const rating = typeof p.rating === 'number' && p.rating >= 0 && p.rating <= 5 ? Math.round(p.rating * 10) / 10 : null
      return {
        place_id: p.placeId!.slice(0, 200), name: cut(p.name, 200), core: coreName(p.name!).slice(0, 200) || plain(p.name!).slice(0, 200),
        address: cut(p.address, 500), city: citiesIn(p.address ?? '')[0] ?? null,
        lat: p.location!.lat, lng: p.location!.lng,
        category: cut(p.category, 120), rating, rating_count: Number.isInteger(p.ratingCount) && p.ratingCount! >= 0 ? p.ratingCount : null,
        phone: cut(p.phone, 40), website: link(p.website, 500, /^https?:\/\//i),
        price_level: cut(p.priceLevel, 60), hours: Array.isArray(p.hours) && p.hours.length ? p.hours.slice(0, 7) : null,
        thumbnail_url: link(p.thumbnailUrl, 1000), maps_url: link(p.mapsUrl, 300),
        details_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
    })
    .filter((r) => r.core)
  if (!a || !rows.length) return
  try {
    await fetch(`${a.url}/known_places?on_conflict=place_id`, {
      method: 'POST', headers: { ...a.headers, prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows), signal: AbortSignal.timeout(4000),
    })
    // This instance knows them at once; others on their next 10-minute reload.
    if (memory) {
      const ids = new Set(memory.places.map((p) => p.place_id))
      for (const r of rows) if (!ids.has(r.place_id)) memory.places.push({ ...r, name: r.name!, confirmations: 0 })
    }
  } catch { /* storing is optional */ }
}

export type StoredPlace = KnownPlace & {
  category: string | null; rating: number | null; rating_count: number | null; phone: string | null; website: string | null
  price_level: string | null; hours: unknown[] | null; thumbnail_url: string | null; maps_url: string | null; details_at: string | null
}

/** Stored venues with details newer than `maxAgeDays`, within about ±450 m of a point. */
export async function storedNear(origin: { lat: number; lng: number }, maxAgeDays = 30) {
  const d = 0.004
  const since = new Date(Date.now() - maxAgeDays * 86400e3).toISOString()
  return get<StoredPlace>(`known_places?lat=gte.${origin.lat - d}&lat=lte.${origin.lat + d}&lng=gte.${origin.lng - d}&lng=lte.${origin.lng + d}&details_at=gte.${encodeURIComponent(since)}&select=*&limit=60`)
}

/** A stored venue in the shape place-details answers with. */
export function storedAsDetails(row: StoredPlace) {
  return {
    name: row.name, address: row.address, category: row.category, categories: row.category ? [row.category] : [],
    rating: row.rating == null ? null : Number(row.rating), ratingCount: row.rating_count, phone: row.phone, website: row.website,
    priceLevel: row.price_level, hours: row.hours, thumbnailUrl: row.thumbnail_url, mapsUrl: row.maps_url, placeId: row.place_id,
    location: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
  }
}

/** Venues people already confirmed when sharing this exact video. */
export async function sharedBefore(videoUrl: string): Promise<Candidate[]> {
  const rows = await get<{ place_name: string; address: string | null; lat: number; lng: number; google_place_id: string | null }>(
    `video_reviews?video_url=eq.${encodeURIComponent(videoUrl)}&lat=not.is.null&lng=not.is.null&place_name=not.is.null&select=place_name,address,lat,lng,google_place_id&limit=5`)
  const seen = new Set<string>()
  return rows.flatMap((r) => {
    const id = r.google_place_id ?? `map:${r.lat},${r.lng}:${r.place_name}`
    if (seen.has(id)) return []
    seen.add(id)
    return [{ placeId: id, name: r.place_name, address: r.address ?? '', location: { lat: r.lat, lng: r.lng }, known: true }]
  })
}
