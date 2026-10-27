// Recognising venues FoodTrip already knows in a caption — no map search, no
// credits. `places` are known_places rows, `aliases` place_aliases rows (both
// loaded by the Edge Function). A venue matches when its name, reduced by
// coreName(), appears whole in the caption, and only if that name is
// distinctive: "Quán Ngon Phố Cổ" must not fire on "món ngon phố cổ Hà Nội".
// Plain JS: Deno and the Node tests share it.

import { plain } from './placeNames.js'
import { citiesIn } from './captionSignals.js'

// Everyday words that never identify a venue on their own.
const GENERIC = new Set(['ngon', 'pho', 'co', 'nha', 'hang', 'quan', 'tiem', 'an', 'mon', 'dac', 'san', 'que', 'huong', 'vi', 'xua', 'viet', 'nam',
  'com', 'bun', 'banh', 'mi', 'xeo', 'cuon', 'canh', 'lau', 'oc', 'che', 'ga', 'vit', 'bo', 'heo', 'ca', 'hai', 'cua', 'tom', 'nuong', 'chay', 'ha', 'noi',
  'cafe', 'coffee', 'ca phe', 'tea', 'tra', 'sua', 'garden', 'house', 'restaurant', 'bistro', 'bar', 'kitchen', 'food', 'the', 'and', 'my', 'little',
  'saigon', 'sai', 'gon', 'hue', 'da', 'nang', 'lat', 'hoi', 'can', 'tho', 'phu', 'quoc', 'trang', 'pa', 'ninh', 'binh', 'phan', 'thiet',
  'o', 'tai', 'gan', 'xin', 'chao', 'hello', 'welcome', 'family', 'gia', 'dinh', 'ngoc', 'hoa', 'mai', 'lan', 'nhat', 'so', 'mot', 'ba', 'bon'])

/** Whether a core name is specific enough to recognise in free text. */
export function distinctiveCore(core) {
  const words = String(core ?? '').split(' ').filter(Boolean)
  return words.length >= 2 && words.join('').length >= 6 && words.some((w) => !GENERIC.has(w) && !/^\d+$/.test(w))
}

/**
 * Known venues a caption names, best first: confirmed aliases, then known names;
 * venues in a different city from the one the caption names are left out.
 * Returns [{ place, via: 'alias' | 'name', hits }].
 */
export function matchKnown(caption, places, aliases = []) {
  const text = ` ${plain(String(caption).replace(/[#@]\s*[\p{L}\p{N}_.]+/gu, ' '))} `
  const cities = citiesIn(caption)
  const byId = new Map(places.map((p) => [p.place_id, p]))
  const inCity = (p) => !cities.length || !p.city || cities.includes(p.city)
  const found = new Map()
  for (const a of aliases) {
    const place = byId.get(a.place_id)
    if (!place || !distinctiveCore(a.alias) || !text.includes(` ${a.alias} `) || !inCity(place)) continue
    const prev = found.get(place.place_id)
    if (!prev || prev.hits < a.hits) found.set(place.place_id, { place, via: 'alias', hits: a.hits })
  }
  for (const place of places) {
    if (found.has(place.place_id) || !distinctiveCore(place.core) || !text.includes(` ${place.core} `) || !inCity(place)) continue
    found.set(place.place_id, { place, via: 'name', hits: place.confirmations ?? 0 })
  }
  // Longer names first (a more specific match), then confirmed more often.
  return [...found.values()].sort((a, b) => (a.via === b.via ? 0 : a.via === 'alias' ? -1 : 1) || b.place.core.length - a.place.core.length || b.hits - a.hits)
}
