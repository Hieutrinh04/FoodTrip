import { supabase, hasSupabase } from './supabaseClient.js'
import { normalise } from './mapAreaSearch.js'
import { CITIES } from '../data/destinations.js'
import { plain, sameVenue } from '../../supabase/functions/_shared/placeNames.js'

export function matchesCatalogQuery(place, query) {
  const needle = plain(query)
  return !needle || plain([place.name?.vi, place.name?.en, place.address?.vi, place.address?.en, place.shortDesc?.vi, place.shortDesc?.en].filter(Boolean).join(' ')).includes(needle)
}

function cityIdOf(row) {
  const text = ` ${plain(row.city || row.address || '')} `
  if (/\b(sai gon|ho chi minh|hcmc|tphcm)\b/.test(text)) return 'hcmc'
  return CITIES.find((c) => [c.id, c.name.vi, c.name.en].some((name) => text.includes(` ${plain(name)} `)))?.id ?? null
}

export function catalogPlace(row) {
  if (!row?.place_id || !row.name || !Number.isFinite(row.lat) || !Number.isFinite(row.lng) || Math.abs(row.lat) > 90 || Math.abs(row.lng) > 180) return null
  // The same store also caches hotels. Keep those out of the dining catalogue.
  if (/hotel|lodging|khách sạn|homestay/i.test(row.category ?? '')) return null
  const place = normalise({
    placeId: row.place_id, name: row.name, address: row.address, location: { lat: row.lat, lng: row.lng },
    category: row.category, rating: row.rating == null ? null : Number(row.rating), ratingCount: row.rating_count,
    hours: row.hours, thumbnailUrl: row.thumbnail_url, mapsUrl: row.maps_url,
    phone: row.phone, website: row.website, priceLevel: row.price_level,
  }, { cityId: cityIdOf(row) })
  const today = Array.isArray(row.hours) ? row.hours.find((r) => r?.weekday === new Date().getDay()) : null
  return { ...place, hours: today?.open && today?.close ? { open: today.open, close: today.close } : null, inCatalog: true }
}

/** One entry per Google id, and per exact venue/address when a seed entry overlaps it. */
export function mergePlaceCatalog(base, incoming) {
  const result = [...base]
  const ids = new Map(), googleIds = new Map(), addresses = new Map()
  const index = (p, at) => {
    ids.set(p.id, at)
    if (p.googlePlaceId) googleIds.set(p.googlePlaceId, at)
    const a = plain(p.address?.vi ?? '')
    if (a.length >= 8) {
      const key = a.slice(0, 8)
      if (!addresses.has(key)) addresses.set(key, new Set())
      addresses.get(key).add(at)
    }
  }
  result.forEach(index)
  for (const p of incoming) {
    let at = ids.get(p.id) ?? (p.googlePlaceId ? googleIds.get(p.googlePlaceId) : undefined)
    if (at == null) {
      const b = plain(p.address?.vi ?? '')
      at = [...(addresses.get(b.slice(0, 8)) ?? [])].find((i) => {
        const old = result[i], a = plain(old.address?.vi ?? '')
        return sameVenue(old.name?.vi ?? '', p.name?.vi ?? '') && b.length >= 8
          && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `))
      })
    }
    if (at == null) { at = result.length; result.push(p) }
    else result[at] = p
    index(p, at)
  }
  return result
}

/** Read persisted venues, not a browser-only cache; pagination cannot silently truncate at 1,000 rows. */
export async function fetchPlaceCatalog({ rpc = hasSupabase ? (args) => supabase.rpc('place_catalog', args) : null } = {}) {
  if (!rpc) return []
  const rows = []
  let after = ''
  for (;;) {
    const { data, error } = await rpc({ p_after: after, p_limit: 500 })
    if (error || !Array.isArray(data)) throw new Error('catalog-unavailable')
    rows.push(...data)
    if (data.length < 500) break
    const next = data.at(-1)?.place_id
    if (!next || next <= after) throw new Error('catalog-invalid-page')
    after = next
  }
  return mergePlaceCatalog([], rows.map(catalogPlace).filter(Boolean))
}
