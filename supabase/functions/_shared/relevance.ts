const GENERIC_WORDS = new Set([
  'nha', 'hang', 'quan', 'an', 'uong', 'tiem', 'cua', 'review',
  'restaurant', 'food', 'cafe', 'coffee', 'viet', 'nam', 'vietnam',
])

export function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Search providers rank broadly related results. FoodTrip is deliberately
 * stricter: every distinctive word in the place name must occur in the
 * result title/snippet. An empty result is preferable to an unrelated one.
 */
export function isRelevantToPlace(text: string, placeName: string) {
  const haystack = ` ${normalizeSearchText(text)} `
  const normalizedName = normalizeSearchText(placeName)
  if (!normalizedName) return false
  if (haystack.includes(` ${normalizedName} `)) return true

  const tokens = [...new Set(normalizedName.split(' ').filter((token) => token.length >= 2 && !/^\d+$/.test(token) && !GENERIC_WORDS.has(token)))]
  if (!tokens.length) return false
  return tokens.every((token) => haystack.includes(` ${token} `))
}

/** Conservative verification used for auto-discovered videos. */
export function hasExactPlaceMention(text: string, placeName: string) {
  const haystack = ` ${normalizeSearchText(text)} `
  const needle = normalizeSearchText(placeName)
  return Boolean(needle) && haystack.includes(` ${needle} `)
}

export function hasLocationEvidence(text: string, location: string) {
  if (!location.trim()) return false
  const haystack = ` ${normalizeSearchText(text)} `
  const normalized = normalizeSearchText(location).replace(/^(thanh pho|tinh) /, '')
  if (normalized === 'ho chi minh') {
    return [' ho chi minh ', ' hcm ', ' tphcm ', ' sai gon ', ' saigon '].some((alias) => haystack.includes(alias))
  }
  return Boolean(normalized) && haystack.includes(` ${normalized} `)
}
