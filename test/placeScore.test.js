import test from 'node:test'
import assert from 'node:assert/strict'

import { scorePlaceDetailed, summarisePlace, describeCriterion } from '../src/lib/placeScore.js'
import { getFoodTripScore, scoreForCriterion, criteriaWithData } from '../src/lib/foodTripScore.js'

const ORIGIN = { lat: 10.7769, lng: 106.7009 }

test('each criterion carries the real figure it was scored from', () => {
  const { parts } = scorePlaceDetailed(
    { tags: [], price: null, location: { lat: 10.8, lng: 106.74 } },
    { rating: 4.4, reviewCount: 27, referenceLocation: ORIGIN },
  )
  const rating = describeCriterion(parts.find((p) => p.key === 'rating'), 'vi')
  const popularity = describeCriterion(parts.find((p) => p.key === 'popularity'), 'vi')
  assert.equal(rating.evidence, '4.4★')
  assert.equal(popularity.evidence, '27 lượt')
})

test('a strength is never presented as a caveat', () => {
  // "Nhiều người biết" scores 6.2/10 — the lowest here, but still a good
  // thing, so it must not follow a "nhưng".
  const { parts } = scorePlaceDetailed(
    { tags: ['coffee'], price: null, location: null },
    { prefs: ['coffee'], rating: 4.2, reviewCount: 300 },
  )
  const summary = summarisePlace(parts, 'vi')
  assert.ok(!summary.includes('nhưng'), summary)
})

test('the rating leads the summary over a budget that scores higher', () => {
  const { parts } = scorePlaceDetailed(
    { tags: [], price: 1, location: { lat: 10.7775, lng: 106.7015 } },
    { rating: 4.7, reviewCount: 5826, referenceLocation: ORIGIN, budgetPerPersonPerDay: 700000 },
  )
  assert.match(summarisePlace(parts, 'vi'), /^Quán được đánh giá xuất sắc \(4\.7★\)/)
})

test('a genuinely poor criterion is named as the caveat', () => {
  const { parts } = scorePlaceDetailed(
    { tags: [], price: null, location: { lat: 10.8, lng: 106.74 } },
    { rating: 4.4, reviewCount: 27, referenceLocation: ORIGIN },
  )
  assert.match(summarisePlace(parts, 'vi'), /nhưng (khá xa chỗ bạn|còn ít người đánh giá)/)
  assert.match(summarisePlace(parts, 'en'), /, but is /)
})

test('no per-criterion score is invented from a single rating', () => {
  const place = { id: 'x', rating: 4.5, category: 'food', price: 1, tags: [] }
  assert.deepEqual(getFoodTripScore(place), { overall: 4.5 })
  assert.equal(scoreForCriterion(place, 'hygiene'), null)
  assert.equal(scoreForCriterion(place, 'overall'), 4.5)
  assert.deepEqual(criteriaWithData([place]), [])
})

test('real per-criterion data is passed through when it exists', () => {
  const place = { id: 'y', rating: 4.1, criteriaScores: { food: 4.6 } }
  assert.equal(scoreForCriterion(place, 'food'), 4.6)
  assert.equal(scoreForCriterion(place, 'service'), null)
  assert.deepEqual(criteriaWithData([place]), ['food'])
})
