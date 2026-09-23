// FoodTrip's retrieval layer — the "R" in RAG.
//
// The app already carries a compact knowledge base: 12 curated cities and ~59
// curated places (names, cities, categories, tags, short descriptions). This
// module indexes it with a lightweight lexical model (weighted token overlap +
// IDF + phrase bonus — no embeddings, no vector store, no extra API) and exposes
// three retrieval functions:
//
//   retrieveCities(text)      — rank curated cities for a free-text request
//   retrievePlaces(text)      — rank curated places for a free-text request
//   matchKnownPlace(name)     — resolve a guessed place name to a known entry
//
// Callers use these to ground the two Anthropic calls (parse-trip-request,
// detect-place): retrieved candidates go into the prompt so the model answers
// with IDs from our own data, and known matches let the client skip the
// follow-up Google Places / city-search calls entirely.

import { CITIES, PLACES, CATEGORY_LABEL, TAGS } from '../data/destinations.js'
import { normalizeVi, tokenize, bigrams, STOPWORDS, placeNameTokens } from './text.js'

// Thematic keywords per city — the domain knowledge that used to live in
// tripRequest.js's flat THEME_TO_CITIES map, now attached to each city and
// weighted into its retrieval document. Accent-free, matched as whole tokens.
const CITY_THEMES = {
  hanoi: ['pho co', 'mien bac', 'thu do', 'pho phuong', 'bun cha', 'ho guom', '36 pho phuong'],
  hoian: ['pho co', 'den long', 'di san', 'mien trung', 'bien', 'cao lau', 'lang man'],
  danang: ['bien', 'mien trung', 'cau rong', 'ba na', 'my khe', 'mi quang'],
  hcmc: ['thanh pho', 'mien nam', 'sai gon', 've dem', 'nightlife', 'hem', 'com tam', 'nhon nhip', 'khong ngu'],
  dalat: ['nui', 'ca phe', 'thong', 'lanh', 'cao nguyen', 'tay nguyen', 'lang man', 'san may', 'lau ga'],
  hue: ['pho co', 'di san', 'cung dinh', 'lich su', 'mien trung', 'song huong', 'lang tam', 'chua'],
  phuquoc: ['bien', 'dao', 'hai san', 'nghi duong', 'resort', 'mien nam', 'cho dem', 'bai sao', 'lan bien'],
  nhatrang: ['bien', 'hai san', 'lan bien', 'thap cham', 'mien trung', 'bai bien', 'banh can'],
  ninhbinh: ['di san', 'nui da', 'song nuoc', 'hang dong', 'mien bac', 'trang an', 'tam coc', 'com chay'],
  cantho: ['song nuoc', 'mien tay', 'cho noi', 'miet vuon', 'mien nam', 'delta', 'song hau', 'lau mam'],
  sapa: ['nui', 'ruong bac thang', 'ban lang', 'trekking', 'lanh', 'mien bac', 'fansipan', 'san may', 'thang co'],
  phanthiet: ['bien', 'doi cat', 'mui ne', 'hai san', 'mien nam', 'cat bay', 'suoi tien'],
}

// Each city's single signature theme — the one a traveller most strongly
// associates with it. A query that mentions it gives that city a decisive edge
// over others that merely share the phrase ("phố cổ" → Hội An, not Hà Nội).
const PRIMARY_THEME = {
  hanoi: 'pho phuong', hoian: 'pho co', danang: 'cau rong', hcmc: 'sai gon',
  dalat: 'ca phe', hue: 'cung dinh', phuquoc: 'bai sao', nhatrang: 'thap cham',
  ninhbinh: 'trang an', cantho: 'cho noi', sapa: 'ruong bac thang', phanthiet: 'doi cat',
}
const PRIMARY_THEME_BONUS = 6

function docFromFields(fields) {
  const weights = new Map()
  for (const { text, weight, keepStopwords } of fields) {
    for (const token of tokenize(text, { keepStopwords })) {
      weights.set(token, Math.max(weights.get(token) ?? 0, weight))
    }
  }
  return weights
}

// Weight added per word when a whole theme phrase ("phố cổ", "săn mây") is
// found verbatim in the query. Themes are matched as phrases, never tokenised
// into the weight map — otherwise "Quy Nhơn" collides with a "nhộn nhịp" theme.
const THEME_WORD_WEIGHT = 4.5

function computeIdf(docs) {
  const df = new Map()
  for (const weights of docs) for (const token of weights.keys()) df.set(token, (df.get(token) ?? 0) + 1)
  const n = docs.length
  const idf = new Map()
  for (const [token, count] of df) idf.set(token, Math.log(1 + n / count))
  return idf
}

const CITY_DOCS = CITIES.map((city) => ({
  city,
  nameTokens: tokenize(`${city.name.vi} ${city.name.en}`, { keepStopwords: true }),
  themePhrases: (CITY_THEMES[city.id] ?? []).map((theme) => normalizeVi(theme)),
  weights: docFromFields([
    { text: city.name.vi, weight: 6, keepStopwords: true },
    { text: city.name.en, weight: 6, keepStopwords: true },
    { text: city.tagline.vi, weight: 1.6 },
    { text: city.tagline.en, weight: 1.6 },
  ]),
}))

const PLACE_DOCS = PLACES.map((place) => ({
  place,
  nameTokens: tokenize(`${place.name.vi} ${place.name.en}`, { keepStopwords: true }),
  weights: docFromFields([
    { text: place.name.vi, weight: 6, keepStopwords: true },
    { text: place.name.en, weight: 6, keepStopwords: true },
    ...(place.tags ?? []).flatMap((tag) => [
      { text: TAGS[tag]?.vi ?? '', weight: 3, keepStopwords: true },
      { text: TAGS[tag]?.en ?? '', weight: 3, keepStopwords: true },
    ]),
    { text: CATEGORY_LABEL[place.category]?.vi ?? '', weight: 1.5, keepStopwords: true },
    { text: place.shortDesc?.vi ?? '', weight: 1 },
    { text: place.shortDesc?.en ?? '', weight: 1 },
  ]),
}))

const CITY_IDF = computeIdf(CITY_DOCS.map((d) => d.weights))
const PLACE_IDF = computeIdf(PLACE_DOCS.map((d) => d.weights))

// Any word that appears in a curated city or place name is normally kept in a
// query even if it is a stopword — otherwise "Ăn Vặt" loses everything. But a
// few one-syllable words are far more often the common word than the name
// fragment ("ăn" the verb vs "An" in Hội An), so they stay stopwords regardless.
const NEVER_PROTECT = new Set(['an', 'co', 'la', 'me', 'ba', 'be', 'cho'])
const PROTECTED_TOKENS = new Set()
for (const doc of [...CITY_DOCS, ...PLACE_DOCS]) {
  for (const token of doc.nameTokens) if (!NEVER_PROTECT.has(token)) PROTECTED_TOKENS.add(token)
}

function queryTokens(text) {
  return tokenize(text, { keepStopwords: true }).filter((t) => !STOPWORDS.has(t) || PROTECTED_TOKENS.has(t))
}

function scoreDoc(qTokens, qBigrams, doc, idf) {
  let score = 0
  for (const token of new Set(qTokens)) {
    const weight = doc.weights.get(token)
    if (weight) score += weight * (idf.get(token) ?? 1.5)
  }
  if (qBigrams.length) {
    const nameJoined = ` ${doc.nameTokens.join(' ')} `
    for (const bigram of qBigrams) if (nameJoined.includes(` ${bigram} `)) score += 7
  }
  return score
}

/** Rank curated cities for a free-text request. `[{ city, score }]`, best first. */
export function retrieveCities(text, k = 4) {
  const qTokens = queryTokens(text)
  if (!qTokens.length) return []
  const qBigrams = bigrams(qTokens)
  const normQuery = ` ${normalizeVi(text)} `
  return CITY_DOCS
    .map((doc) => {
      let score = scoreDoc(qTokens, qBigrams, doc, CITY_IDF)
      for (const phrase of doc.themePhrases) {
        if (phrase && normQuery.includes(` ${phrase} `)) score += THEME_WORD_WEIGHT * phrase.split(' ').length
      }
      const primary = PRIMARY_THEME[doc.city.id]
      if (primary && normQuery.includes(` ${primary} `)) score += PRIMARY_THEME_BONUS
      return { city: doc.city, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/** Rank curated places for a free-text request, optionally scoped to a city. */
export function retrievePlaces(text, { k = 8, cityId = null } = {}) {
  const qTokens = queryTokens(text)
  if (!qTokens.length) return []
  const qBigrams = bigrams(qTokens)
  return PLACE_DOCS
    .filter((doc) => !cityId || doc.place.city === cityId)
    .map((doc) => ({ place: doc.place, score: scoreDoc(qTokens, qBigrams, doc, PLACE_IDF) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// A short query from the AI ("biển", "Đà Lạt", "phố cổ") is almost always a
// theme or a name and just needs the top city to clear a low bar. A long
// free-text request has more noise, so it needs a strong hit and a clear lead
// over the runner-up before we override "custom destination".
const SHORT_QUERY_TOKENS = 3
const MIN_CITY_SCORE_SHORT = 3.5
const MIN_CITY_SCORE_LONG = 11
const CITY_LEAD_RATIO = 1.25

/** "Sa Pa" → "sapa", "TP. Hồ Chí Minh" → "tphochiminh" — for run-together typing. */
function spaceless(s) {
  return normalizeVi(s).replace(/\s+/g, '')
}

/**
 * Resolves a free-text destination to a curated city or flags it as a custom
 * destination name. Drop-in replacement for the old string-matching
 * `resolveDestinationQuery` — same return shape, plus `confidence` and, for
 * custom destinations, `suggestions` (nearby curated city ids).
 */
export function resolveDestination(query) {
  if (!query?.trim()) return null
  const norm = normalizeVi(query)
  const normFlat = spaceless(query)

  const direct = CITIES
    .map((city) => ({ city, vi: normalizeVi(city.name.vi), en: normalizeVi(city.name.en) }))
    .filter(({ vi, en }) => {
      if (norm.includes(vi) || norm.includes(en)) return true
      if (norm.length >= 3 && (vi.includes(norm) || en.includes(norm))) return true
      // "sapa"/"danang" typed without the space — only for names long enough
      // that a run-together substring is unlikely to collide with real words
      const flatVi = spaceless(vi)
      const flatEn = spaceless(en)
      return (flatVi.length >= 4 && normFlat.includes(flatVi)) || (flatEn.length >= 4 && normFlat.includes(flatEn))
    })
    .sort((a, b) => b.vi.length - a.vi.length)[0]
  if (direct) return { type: 'curated', cityId: direct.city.id, confidence: 'high' }

  const ranked = retrieveCities(query, 4)
  const [top, second] = ranked
  const isShort = queryTokens(query).length <= SHORT_QUERY_TOKENS
  const minScore = isShort ? MIN_CITY_SCORE_SHORT : MIN_CITY_SCORE_LONG
  const hasLead = !second || top?.score >= second.score * CITY_LEAD_RATIO || isShort
  if (top && top.score >= minScore && hasLead) {
    return { type: 'curated', cityId: top.city.id, confidence: isShort ? 'high' : 'medium' }
  }
  return { type: 'custom', name: query.trim(), suggestions: ranked.map((r) => r.city.id) }
}

/** Compact candidate rows for grounding the parse-trip-request prompt. */
export function tripRequestCandidates(text) {
  const cities = retrieveCities(text, 4)
  const places = retrievePlaces(text, { k: 6 })
  return {
    cityCandidates: cities.map(({ city }) => ({
      id: city.id,
      name: city.name.vi,
      themes: (CITY_THEMES[city.id] ?? []).slice(0, 6).join(', '),
    })),
    placeCandidates: places.map(({ place }) => ({
      id: place.id,
      name: place.name.vi,
      city: place.city,
      category: place.category,
    })),
  }
}

// --- Known-place matching (grounds detect-place / skips verify-place) ---------

const NAME_NOISE = new Set([
  ...STOPWORDS,
  'quan', 'nha', 'hang', 'tiem', 'cua', 'hieu', 'restaurant', 'cafe', 'coffee', 'food',
  'the', 'shop', 'bar', 'ca', 'phe',
])

function nameTokenSet(value) {
  return new Set(normalizeVi(value).split(' ').filter((t) => t.length >= 2 && !NAME_NOISE.has(t)))
}

/**
 * Resolves a guessed place name (and optional area) to a known entry — a
 * curated PLACE or one of the `extra` rows a caller passes in (e.g. already
 * verified video reviews). Returns `{ id, name, address, location, city, source }`
 * or null when nothing matches confidently.
 *
 * `location` is null for curated matches (the seed dataset carries no
 * coordinates) — callers still verify those, but with a canonical name/address.
 * A match from `extra` that carries `location` can skip verification entirely.
 */
export function matchKnownPlace(name, area = '', extra = []) {
  const wanted = nameTokenSet(name)
  if (!wanted.size) return null
  const normArea = normalizeVi(area)

  const pool = [
    ...PLACES.map((p) => ({
      id: p.id,
      name: p.name.vi,
      altName: p.name.en,
      address: p.address?.vi ?? '',
      location: p.location ?? null,
      city: p.city,
      source: 'curated',
    })),
    ...extra.map((p) => ({
      id: p.googlePlaceId ?? p.placeId ?? p.id ?? null,
      name: p.name ?? p.placeName ?? '',
      altName: '',
      address: p.address ?? '',
      location: p.location ?? null,
      city: p.city ?? null,
      source: p.source ?? 'known',
    })),
  ]

  let best = null
  for (const entry of pool) {
    if (!entry.name) continue
    const candidateTokens = nameTokenSet(`${entry.name} ${entry.altName}`)
    if (!candidateTokens.size) continue
    let hits = 0
    for (const token of wanted) if (candidateTokens.has(token)) hits++
    const coverage = hits / wanted.size
    const candCoverage = hits / candidateTokens.size
    // Both sides must mostly agree: "Bánh Mì Phượng" vs "Bánh Mì Phượng Hội An"
    // passes; "Bánh Mì Huỳnh Hoa" vs "Bánh Mì Phượng" does not.
    if (coverage < 0.6 || candCoverage < 0.5) continue
    let score = coverage + candCoverage
    if (normArea && entry.address && normalizeVi(entry.address).includes(normArea.split(' ').pop())) score += 0.5
    if (!best || score > best.score) best = { entry, score }
  }
  if (!best || !best.entry.id) return null
  const { entry } = best
  return { id: entry.id, name: entry.name, address: entry.address, location: entry.location ?? null, city: entry.city, source: entry.source }
}

/**
 * Grounding rows for the detect-place prompt.
 *
 * A video caption is the query: retrieving against it surfaces the curated
 * places it plausibly mentions, so the model can answer with our own ids and
 * canonical spellings instead of a free-text guess the client then has to
 * re-resolve. `known` carries rows the caller already holds — saved video
 * reviews, which come with verified coordinates — so a place shared twice is
 * recognised the second time without another Places lookup.
 */
export function videoCandidates(caption, known = []) {
  const fromCatalogue = retrievePlaces(caption, { k: 8 }).map(({ place }) => ({
    id: place.id,
    name: place.name.vi,
    city: place.city,
    source: 'curated',
  }))

  // Saved reviews are ranked by the same name-token test used everywhere else,
  // so an unrelated saved place never enters the prompt.
  const fromKnown = known
    .filter((row) => row.placeName && textIsAboutPlaceLoose(caption, row.placeName))
    .slice(0, 6)
    .map((row) => ({
      id: row.googlePlaceId ?? row.id,
      name: row.placeName,
      city: null,
      source: 'saved',
    }))

  const seen = new Set()
  return [...fromKnown, ...fromCatalogue].filter((row) => {
    if (!row.id || !row.name || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  }).slice(0, 12)
}

// A caption is long and chatty, so requiring *every* identifying word of a name
// (as textIsAboutPlace does) is too strict here — one distinctive word is
// enough to make a row worth offering the model as a candidate.
function textIsAboutPlaceLoose(text, name) {
  const wanted = placeNameTokens(name)
  if (!wanted.length) return false
  const haystack = ` ${normalizeVi(text)} `
  return wanted.some((token) => token.length >= 3 && haystack.includes(` ${token} `))
}
