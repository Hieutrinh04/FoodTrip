// Shared text-normalisation helpers used by the knowledge-base retrieval layer
// and every caller that needs to compare Vietnamese strings loosely (accent- and
// case-insensitive). Kept in its own module so `knowledgeBase.js` and
// `tripRequest.js` can both use it without an import cycle.

/** Lowercase, strip Vietnamese accents, drop punctuation. "Đà Lạt!" → "da lat". */
export function normalizeVi(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Words that carry no destination/topic signal in a Vietnamese trip request —
// dropped before retrieval so "lên kế hoạch 3 ngày ở Phan Thiết" scores on
// "phan thiet" alone rather than on "ngay"/"o"/"len".
export const STOPWORDS = new Set([
  'len', 'ke', 'hoach', 'lap', 'lich', 'trinh', 'du', 'di', 'den', 'toi', 'o', 'tai', 'chuyen',
  'ngay', 'dem', 'tuan', 'thang', 'nguoi', 'nhom', 'ban', 'be', 'gia', 'dinh', 'con',
  'chi', 'phi', 'tien', 'ngan', 'sach', 'khoang', 'tam', 'duoi', 'tren', 'gan', 'trieu', 'nghin', 'ngan',
  'toi', 'minh', 'muon', 'thich', 'can', 'cho', 'va', 'voi', 'mot', 'hai', 'cac', 'nhung', 'la', 'co',
  'an', 'uong', 'choi', 'tham', 'quan', 'review', 'quay', 'vong',
  'plan', 'trip', 'days', 'day', 'night', 'nights', 'people', 'person', 'budget', 'for', 'the', 'and',
  'with', 'want', 'like', 'about', 'from', 'per', 'week', 'group',
])

/** Query/document tokens: normalised, split, stopwords and bare numbers removed. */
export function tokenize(s, { keepStopwords = false } = {}) {
  return normalizeVi(s)
    .split(' ')
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && (keepStopwords || !STOPWORDS.has(t)))
}

/** Adjacent-word bigrams of a token list — lets "phan thiet" match as a phrase. */
export function bigrams(tokens) {
  const out = []
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`)
  return out
}

// Live map results carry SEO-stuffed names — "Yên study càfe | Quán cà phê học
// bài Bình Dương | Quán cà phê yên tĩnh Bình Dương | …" — which are useless as a
// search phrase. The real name is the first segment before a separator.
const NAME_SEPARATORS = /\s*[|·•–—]\s*|\s+-\s+|\s*\/\s*/

/** "Yên study càfe | Quán cà phê học bài…" → "Yên study càfe". */
export function primaryPlaceName(name) {
  const first = (name || '').split(NAME_SEPARATORS)[0]?.trim()
  return first && first.length >= 2 ? first : (name || '').trim()
}

const COUNTRY_TAIL = /^(việt nam|vietnam|vn)$/i

/**
 * From a formatted address, the "<ward>, <city>" a content search should be
 * scoped to — country and postcodes dropped.
 * "55/12 Trương Định, Phú Lợi, Hồ Chí Minh 70000, Việt Nam" → "Phú Lợi, Hồ Chí Minh".
 */
export function searchArea(address) {
  const parts = (address || '')
    .split(',')
    .map((p) => p.replace(/\b\d{4,}\b/g, '').trim())
    .filter((p) => p && !COUNTRY_TAIL.test(p))
  return parts.slice(-2).join(', ')
}

/** Just the city/province from a formatted address — the last meaningful part. */
export function cityFromAddress(address) {
  const parts = searchArea(address).split(',').map((p) => p.trim()).filter(Boolean)
  return parts.at(-1) ?? ''
}

// Words that appear in most place names and so carry no identifying signal —
// dropped before checking whether a search result is really about a place.
export const PLACE_NAME_NOISE = new Set([
  'quan', 'nha', 'hang', 'tiem', 'cua', 'hieu', 'diem', 'khu',
  'restaurant', 'cafe', 'coffee', 'food', 'the', 'shop', 'store', 'bar',
  'ca', 'phe', 'an', 'uong', 'review', 'viet', 'nam', 'vietnam',
])

/** The identifying words of a place name — de-SEO'd, normalised, noise removed. */
export function placeNameTokens(name) {
  return [...new Set(tokenize(primaryPlaceName(name), { keepStopwords: true }).filter((t) => !PLACE_NAME_NOISE.has(t)))]
}

/**
 * Whether a piece of text (a video title, an article headline + snippet) is
 * plausibly about a given place: every identifying word of the name must appear
 * in it. A name with no identifying words left can't be checked, so it passes.
 */
export function textIsAboutPlace(text, name) {
  const wanted = placeNameTokens(name)
  if (!wanted.length) return true
  const haystack = ` ${normalizeVi(text)} `
  return wanted.every((token) => haystack.includes(` ${token} `))
}
