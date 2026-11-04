// Offline integration check. No credentials, fetch, or telemetry.
import assert from 'node:assert/strict'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'
import { composeReply } from '../supabase/functions/_shared/assistant/reply.js'
import { assessPlaceData } from '../supabase/functions/_shared/assistant/placeAssessment.js'
import { findFoodAnswer } from '../src/lib/assistantAnswers.js'
import { planTurn, resolveChatTurn } from '../src/lib/assistantConversation.js'
import { placeFollowUp } from '../src/lib/assistantPlaceContext.js'
import { catalogPlace } from '../src/lib/placeCatalog.js'
import { normalise } from '../src/lib/mapAreaSearch.js'

// Offline smoke check: no env files, telemetry, or external requests.
const rawPlace = { placeId: 'offline-pho', name: 'Phở kiểm thử', address: 'Hà Nội (fixture)', location: { lat: 21.0285, lng: 105.8542 }, rating: 4.5, ratingCount: 100, category: 'Restaurant' }
async function request(path, body) {
  if (path === 'functions/v1/assistant') {
    if (body.placeAssessment) return { assessment: assessPlaceData(body.placeAssessment, body.lang) }
    const reading = ruleIntent(body.message)
    return { ...composeReply(body.message, reading, body.lang), ...reading, slots: [] }
  }
  if (path === 'rest/v1/rpc/place_catalog') return []
  if (path.startsWith('functions/v1/map-place-search?')) return { status: 'ok', places: [rawPlace] }
  throw new Error('Unexpected fixture request')
}
const message = 'các địa chỉ ăn ngon tại Hà Nội'
const reading = await request('functions/v1/assistant', { message, lang: 'vi' })
assert.equal(reading.intent, 'find_food')
const trip = planTurn('Hà Nội 2 ngày 2 người', [], null, null).trip
assert.equal(resolveChatTurn(message, reading, { trip }).updatePlan, false)
const rows = await request('rest/v1/rpc/place_catalog', { p_after: '', p_limit: 500 })
const catalog = async () => rows.map(catalogPlace).filter(Boolean)
const reply = await findFoodAnswer(message, [], trip, 'vi', {
  catalog,
  locate: async () => ({ lat: 11.9404, lng: 108.4583 }),
  search: async ({ keyword, origin }) => {
    const params = new URLSearchParams({ q: keyword, lat: origin.lat, lng: origin.lng, radiusKm: '5', pages: '1' })
    const found = await request(`functions/v1/map-place-search?${params}`)
    return { ...found, places: (found.places ?? []).map((p) => normalise(p, { cityId: 'hanoi' })) }
  },
})
assert.ok(reply.places?.length)
const foodSearch = { message, slots: [], trip }
const messages = [{ from: 'bot', places: reply.places, foodSearch }]
const chosen = placeFollowUp('đánh giá quán thứ nhất', messages)
assert.equal(chosen.type, 'assessment')
assert.equal(chosen.place.id, reply.places[0].id)
const p = chosen.place
const assessment = await request('functions/v1/assistant', { lang: 'vi', placeAssessment: {
  name: p.name.vi, address: p.address.vi, rating: p.googleRating, ratingCount: p.googleRatingCount, reviews: [],
} })
assert.ok(assessment.assessment?.text.includes(p.name.vi))
assert.equal(placeFollowUp('còn quán khác không?', messages).type, 'more')
const faq = await request('functions/v1/assistant', { message: 'huỷ phòng có được hoàn tiền không', lang: 'vi' })
assert.equal(faq.intent, 'booking_cancel_refund')
console.log(JSON.stringify({ mode: 'offline-fixtures', checks: 'passed', foodIntent: reading.intent, returnedPlaces: reply.places.map((p) => p.name.vi), referenceResolved: chosen.place.name.vi, assessmentSource: assessment.assessment.source, switchedTopic: faq.intent }, null, 2))
