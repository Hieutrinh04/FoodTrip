export const GENERIC_WORDS = new Set([
  'nha', 'hang', 'quan', 'an', 'uong', 'tiem', 'cua', 'hieu', 'review', 'diem', 'khu',
  'restaurant', 'food', 'cafe', 'coffee', 'the', 'shop', 'store', 'bar',
  'viet', 'nam', 'vietnam', 'ca', 'phe',
])

export function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Live Google/Serper results carry SEO-stuffed names ("Yên study càfe | Quán cà
// phê học bài Bình Dương | …"). The real name is the first segment; a search for
// the whole blob matches nothing and makes the provider relax the query.
const NAME_SEPARATORS = /\s*[|·•–—]\s*|\s+-\s+|\s*\/\s*/

export function primaryName(name: string) {
  const first = (name || '').split(NAME_SEPARATORS)[0]?.trim()
  return first && first.length >= 2 ? first : (name || '').trim()
}

/** The identifying words of a place name — normalised, generic words removed. */
export function placeNameTokens(name: string) {
  const normalized = normalizeSearchText(primaryName(name))
  return [...new Set(normalized.split(' ').filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !GENERIC_WORDS.has(t)))]
}

/**
 * Whether a piece of text is plausibly about a place: every identifying word of
 * the (de-SEO'd) name must occur in it. A name with nothing identifying left
 * can't be checked, so it fails closed. An empty result is better than a wrong
 * one.
 */
export function isRelevantToPlace(text: string, placeName: string) {
  const haystack = ` ${normalizeSearchText(text)} `
  const fullName = normalizeSearchText(primaryName(placeName))
  if (fullName && haystack.includes(` ${fullName} `)) return true
  const tokens = placeNameTokens(placeName)
  if (!tokens.length) return false
  return tokens.every((token) => haystack.includes(` ${token} `))
}

/** @deprecated kept for callers not yet migrated — same as isRelevantToPlace now. */
export function hasExactPlaceMention(text: string, placeName: string) {
  return isRelevantToPlace(text, placeName)
}

const CITY_ALIASES: Record<string, string[]> = {
  'ho chi minh': ['ho chi minh', 'hcm', 'tphcm', 'tp hcm', 'sai gon', 'saigon'],
  'ba ria vung tau': ['ba ria', 'vung tau'],
  'thua thien hue': ['hue'],
}

export function hasLocationEvidence(text: string, location: string) {
  if (!location.trim()) return false
  const haystack = ` ${normalizeSearchText(text)} `
  const normalized = normalizeSearchText(location).replace(/^(thanh pho|tp|tinh) /, '')
  // Try the whole area string and, in case it was "<ward>, <city>", its tail.
  const words = normalized.split(' ')
  const candidates = new Set([normalized, words.slice(-2).join(' '), words.slice(-1).join(' ')])
  for (const candidate of candidates) {
    if (candidate.length < 3) continue
    const aliases = CITY_ALIASES[candidate] ?? [candidate]
    if (aliases.some((alias) => haystack.includes(` ${alias} `))) return true
  }
  return false
}

/**
 * The single test for auto-discovered content: the text must name the place,
 * and — when a location is supplied — also place it in the right city, so a
 * same-named venue elsewhere doesn't slip through.
 */
export function mentionsPlace(text: string, placeName: string, location = '') {
  if (!isRelevantToPlace(text, placeName)) return false
  return location.trim() ? hasLocationEvidence(text, location) : true
}

// Only content from a recognised source is shown. Without this, a relaxed
// Google query for a place with no coverage returns help-centre and forum
// pages that pass every keyword check by coincidence.
export const CONTENT_HOST_ALLOWLIST = [
  'foody.vn', 'vnexpress.net', 'thanhnien.vn', 'tuoitre.vn', 'kenh14.vn', 'dantri.com.vn',
  'nld.com.vn', 'zingnews.vn', 'afamily.vn', 'toquoc.vn', 'vietnamnet.vn',
  'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be',
]

export function contentHostAllowed(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return CONTENT_HOST_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}
