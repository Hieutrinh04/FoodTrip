/**
 * The project's Weighted Sum Model for scoring a place — the single definition
 * shared by the itinerary generator and the explore map, so both rank places
 * by exactly the same rules.
 *
 *   Score = 0.30×Sở thích + 0.25×Đánh giá + 0.20×Khoảng cách
 *         + 0.15×Ngân sách + 0.10×Độ phổ biến
 *
 * This is a *suitability* score computed by the system from the criteria above.
 * It is not a user rating: the "Đánh giá" term is one input among five, and it
 * only participates when real review data exists for that place.
 */

export const WEIGHTS = { preference: 0.3, rating: 0.25, distance: 0.2, budget: 0.15, popularity: 0.1 }

export const CRITERION_LABEL = {
  preference: { vi: 'Sở thích', en: 'Preference' },
  rating: { vi: 'Đánh giá', en: 'Rating' },
  distance: { vi: 'Khoảng cách', en: 'Distance' },
  budget: { vi: 'Ngân sách', en: 'Budget' },
  popularity: { vi: 'Độ phổ biến', en: 'Popularity' },
}

// Distance score decays with travel from the reference point: same spot scores
// 1, 1.5km scores 0.5, 5km scores ~0.23.
const DISTANCE_HALF_LIFE_KM = 1.5

export function haversineKm(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function budgetFit(price, budgetPerPersonPerDay) {
  if (price == null) return null
  if (price <= 1 || budgetPerPersonPerDay >= 600000) return 1
  if (price === 2 && budgetPerPersonPerDay >= 300000) return 0.7
  return 0.4
}

/**
 * Scores one place and reports which criteria actually contributed.
 *
 * Criteria with no data are dropped and the remaining weights renormalised, so
 * a missing signal never drags every candidate down by the same fixed amount.
 * This matters in practice: the map provider publishes no ratings or review
 * counts at all, and a place brought in from live search carries no preference
 * tags, so those terms would otherwise be a constant zero for everyone.
 *
 * @returns { score, parts, coverage } — `score` in [0, 1], `parts` lists the
 *          criteria used with their contribution, `coverage` is the share of
 *          total weight that had data behind it.
 */
export function scorePlaceDetailed(place, { prefs = [], budgetPerPersonPerDay = 0, referenceLocation = null, rating, reviewCount, location } = {}) {
  const parts = []

  const tags = place.tags ?? []
  // Preference only counts when the traveller stated one and the place is
  // actually tagged; an untagged live result has nothing to match against.
  if (prefs.length && tags.length) {
    const matched = tags.filter((t) => prefs.includes(t))
    parts.push({ key: 'preference', weight: WEIGHTS.preference, value: matched.length ? 1 : 0, detail: { matched } })
  }

  const effectiveRating = rating ?? place.rating
  if (effectiveRating != null) {
    parts.push({ key: 'rating', weight: WEIGHTS.rating, value: Math.min(effectiveRating, 5) / 5, detail: { rating: effectiveRating } })
  }

  const placeLocation = location ?? place.location ?? null
  if (referenceLocation && placeLocation) {
    const km = haversineKm(referenceLocation, placeLocation)
    if (km != null) {
      parts.push({ key: 'distance', weight: WEIGHTS.distance, value: 1 / (1 + km / DISTANCE_HALF_LIFE_KM), detail: { km } })
    }
  }

  const fit = budgetFit(place.price, budgetPerPersonPerDay)
  if (fit != null) parts.push({ key: 'budget', weight: WEIGHTS.budget, value: fit, detail: { price: place.price } })

  const effectiveReviewCount = reviewCount ?? place.userRatingCount
  if (effectiveReviewCount != null) {
    parts.push({ key: 'popularity', weight: WEIGHTS.popularity, value: Math.min(Math.log10(effectiveReviewCount + 1) / 4, 1), detail: { reviewCount: effectiveReviewCount } })
  }

  const usedWeight = parts.reduce((sum, part) => sum + part.weight, 0)
  if (!usedWeight) return { score: null, parts: [], coverage: 0 }

  const score = parts.reduce((sum, part) => sum + part.weight * part.value, 0) / usedWeight
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
  return { score, parts, coverage: usedWeight / totalWeight }
}

/** Convenience wrapper returning just the [0, 1] score (null when nothing could be scored). */
export function scorePlace(place, context) {
  return scorePlaceDetailed(place, context).score
}

/** Presentation helper: the 0–10 figure shown on map markers and cards. */
export function toTenPointScale(score) {
  return score == null ? null : Math.round(score * 10 * 10) / 10
}

/**
 * Words a traveller can act on, instead of a number talking about the model.
 *
 * "Đánh giá 8.8/10" says nothing about the place. "Rất tốt · 4.4★" says what
 * was actually found, and lets the reader disagree with the weighting if they
 * want to. Every phrase below is derived from real data the place came with —
 * a criterion with no data never gets here, because scorePlaceDetailed drops it
 * rather than scoring it zero.
 */

// Each band carries a tone as well as a phrase. The tone is what decides
// whether a criterion may be used as a caveat: without it, "Nhiều người biết"
// scored 6.2/10 came out as "…nhưng nhiều người biết", turning a selling point
// into a warning purely because it was the lowest number present.
const VERDICTS = {
  rating: [
    [0.92, 'good', { vi: 'Xuất sắc', en: 'outstanding' }],
    [0.84, 'good', { vi: 'Rất tốt', en: 'very good' }],
    [0.72, 'good', { vi: 'Tốt', en: 'good' }],
    [0.60, 'neutral', { vi: 'Khá', en: 'fair' }],
    [0, 'bad', { vi: 'Dưới trung bình', en: 'below average' }],
  ],
  distance: [
    [0.75, 'good', { vi: 'Rất gần', en: 'very close' }],
    [0.50, 'good', { vi: 'Gần', en: 'close' }],
    [0.30, 'neutral', { vi: 'Hơi xa', en: 'a bit far' }],
    [0, 'bad', { vi: 'Khá xa', en: 'far' }],
  ],
  popularity: [
    [0.80, 'good', { vi: 'Rất nổi tiếng', en: 'very well known' }],
    [0.60, 'good', { vi: 'Nhiều người biết', en: 'well known' }],
    [0.40, 'neutral', { vi: 'Có tiếng ở khu vực', en: 'known locally' }],
    [0, 'bad', { vi: 'Còn ít người đánh giá', en: 'barely reviewed yet' }],
  ],
  budget: [
    [0.9, 'good', { vi: 'Thoải mái so với ngân sách', en: 'comfortable for your budget' }],
    [0.6, 'neutral', { vi: 'Vừa tầm ngân sách', en: 'within your budget' }],
    [0, 'bad', { vi: 'Cao hơn ngân sách', en: 'above your budget' }],
  ],
  preference: [
    [1, 'good', { vi: 'Đúng gu bạn chọn', en: 'a match for your taste' }],
    [0, 'bad', { vi: 'Khác gu bạn chọn', en: 'outside your stated taste' }],
  ],
}

function bandOf(key, value) {
  const bands = VERDICTS[key]
  if (!bands) return null
  return bands.find(([floor]) => value >= floor) ?? bands[bands.length - 1]
}

const PREFERENCE_LABEL = {
  seafood: { vi: 'hải sản', en: 'seafood' }, vegetarian: { vi: 'món chay', en: 'vegetarian' },
  coffee: { vi: 'cà phê', en: 'coffee' }, oldtown: { vi: 'phố cổ', en: 'old town' },
  nightlife: { vi: 'về đêm', en: 'nightlife' }, nature: { vi: 'thiên nhiên', en: 'nature' },
  streetfood: { vi: 'ăn vặt', en: 'street food' }, beach: { vi: 'biển', en: 'beach' },
  culture: { vi: 'văn hoá', en: 'culture' },
}

const PRICE_EVIDENCE = [
  { vi: 'giá bình dân', en: 'budget prices' },
  { vi: 'giá vừa phải', en: 'moderate prices' },
  { vi: 'giá cao', en: 'expensive' },
  { vi: 'giá rất cao', en: 'very expensive' },
]

/** The real figure behind a criterion, e.g. "4,4★ từ 27 lượt" or "3,9 km". */
function evidenceOf(part, lang) {
  const d = part.detail ?? {}
  const vi = lang === 'vi'
  switch (part.key) {
    case 'rating':
      return d.rating == null ? null : `${d.rating.toFixed(1)}★`
    case 'popularity':
      // Just the count: the verdict beside it already says "ít người đánh giá",
      // and repeating the word there reads like a stutter.
      return d.reviewCount == null
        ? null
        : vi ? `${d.reviewCount.toLocaleString('vi-VN')} lượt` : `${d.reviewCount.toLocaleString('en-US')} reviews`
    case 'distance':
      if (d.km == null) return null
      return d.km < 1 ? `${Math.round(d.km * 1000)} m` : `${d.km.toFixed(1)} km`
    case 'budget':
      return PRICE_EVIDENCE[d.price]?.[lang] ?? null
    case 'preference': {
      const names = (d.matched ?? []).map((tag) => PREFERENCE_LABEL[tag]?.[lang] ?? tag)
      return names.length ? names.join(', ') : null
    }
    default:
      return null
  }
}

/**
 * `{ key, label, verdict, evidence, value }` for one criterion — everything the
 * UI needs to describe it without knowing how it was scored.
 */
export function describeCriterion(part, lang) {
  const band = bandOf(part.key, part.value)
  return {
    key: part.key,
    label: CRITERION_LABEL[part.key]?.[lang] ?? part.key,
    verdict: band?.[2]?.[lang] ?? null,
    tone: band?.[1] ?? 'neutral',
    evidence: evidenceOf(part, lang),
    value: part.value,
  }
}

// Each criterion as a clause that can sit inside a sentence, rather than as a
// standalone label. "Khoảng cách: 3.9/10" and "hơi xa chỗ bạn (3,9 km)" carry
// the same fact, but only one of them reads like an answer to a question.
// Clauses are written to follow "Quán …" / "This place …" so the two halves of
// the summary can be joined without either half re-stating the subject.
const CLAUSE = {
  rating: {
    vi: (d) => `được đánh giá ${d.verdict.toLowerCase()}${d.evidence ? ` (${d.evidence})` : ''}`,
    en: (d) => `is rated ${d.verdict}${d.evidence ? ` (${d.evidence})` : ''}`,
  },
  distance: {
    vi: (d) => `${d.verdict.toLowerCase()} chỗ bạn${d.evidence ? ` (${d.evidence})` : ''}`,
    en: (d) => `is ${d.verdict} from you${d.evidence ? ` (${d.evidence})` : ''}`,
  },
  popularity: {
    vi: (d) => `${d.verdict.toLowerCase()}${d.evidence ? ` (${d.evidence})` : ''}`,
    en: (d) => `is ${d.verdict}${d.evidence ? ` (${d.evidence})` : ''}`,
  },
  budget: {
    vi: (d) => `${d.verdict.toLowerCase()}${d.evidence ? ` (${d.evidence})` : ''}`,
    en: (d) => `is ${d.verdict}${d.evidence ? ` (${d.evidence})` : ''}`,
  },
  preference: {
    vi: (d) => (d.value ? `đúng gu ${d.evidence ?? 'bạn chọn'}` : 'khác gu bạn chọn'),
    en: (d) => (d.value ? `matches your taste for ${d.evidence ?? 'this'}` : 'is outside your stated taste'),
  },
}

// Which criterion leads the sentence when several are strong. Budget is last on
// purpose: "thoải mái so với ngân sách" is true but it is not why anyone picks
// a restaurant, and it was beating a 4.7★ rating simply by scoring 10.0.
const HEADLINE_ORDER = ['rating', 'preference', 'distance', 'popularity', 'budget']

/**
 * One sentence describing the place: what it has going for it, and the one
 * thing worth knowing before going.
 *
 * Deliberately two clauses, not five. A traveller scanning a map panel reads
 * the first line and moves on; the full breakdown sits underneath for anyone
 * who wants to check the reasoning.
 */
export function summarisePlace(parts, lang) {
  if (!parts?.length) return null
  const described = parts.map((part) => describeCriterion(part, lang)).filter((d) => d.verdict)
  if (!described.length) return null

  const rank = (d) => HEADLINE_ORDER.indexOf(d.key)
  const strengths = described.filter((d) => d.tone === 'good').sort((a, b) => rank(a) - rank(b))
  // Nothing scored well: lead with whatever scored highest rather than staying
  // silent, so the sentence still says something true about the place.
  const best = strengths[0] ?? [...described].sort((a, b) => b.value - a.value)[0]

  // Only a genuinely poor criterion earns a "but", and never the one already
  // being used as the headline.
  const worst = described
    .filter((d) => d.tone === 'bad' && d.key !== best.key)
    .sort((a, b) => a.value - b.value)[0] ?? null

  const clause = (d) => CLAUSE[d.key]?.[lang]?.(d) ?? `${d.label.toLowerCase()}: ${d.verdict.toLowerCase()}`
  const subject = lang === 'vi' ? 'Quán' : 'This place'

  if (!worst) {
    return lang === 'vi'
      ? `${subject} ${clause(best)}, và không có tiêu chí nào đáng lo.`
      : `${subject} ${clause(best)}, with nothing that stands out as a concern.`
  }
  return lang === 'vi'
    ? `${subject} ${clause(best)}, nhưng ${clause(worst)}.`
    : `${subject} ${clause(best)}, but ${clause(worst)}.`
}
