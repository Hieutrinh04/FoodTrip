const CRITERIA = ['food', 'value', 'service', 'space', 'hygiene']

export const FOODTRIP_CRITERIA = {
  food: { vi: 'Món ăn', en: 'Food' },
  value: { vi: 'Đáng tiền', en: 'Value' },
  service: { vi: 'Phục vụ', en: 'Service' },
  space: { vi: 'Không gian', en: 'Ambience' },
  hygiene: { vi: 'Vệ sinh', en: 'Hygiene' },
}

/**
 * The community scorecard for a place.
 *
 * Only the overall rating is real. The per-criterion values (Món ăn, Vệ sinh,
 * Phục vụ…) used to be manufactured from that one number plus an offset hashed
 * from the place id — a "Vệ sinh 4.6" beside a real restaurant's name that no
 * review had ever given. No review in the dataset scores individual criteria,
 * so none are reported: a criterion only appears here once real per-criterion
 * review data exists (the review_scores aggregates in the production schema).
 *
 * Returns null when the place carries no rating at all, the same way an
 * unreviewed listing shows no score on any maps app.
 */
export function getFoodTripScore(place) {
  if (place.rating == null) return null
  const criteria = Object.fromEntries(
    CRITERIA.filter((key) => place.criteriaScores?.[key] != null).map((key) => [key, place.criteriaScores[key]]),
  )
  return { overall: place.rating, ...criteria }
}

/**
 * Score for one criterion. Null when that criterion has no real data — never
 * the overall rating standing in for it, which would label a general score as
 * a hygiene score.
 */
export function scoreForCriterion(place, criterion = 'overall') {
  const score = getFoodTripScore(place)
  if (!score) return null
  return score[criterion] ?? null
}

/** Criteria that at least one of these places has real data for. */
export function criteriaWithData(places) {
  return CRITERIA.filter((key) => places.some((place) => place.criteriaScores?.[key] != null))
}
