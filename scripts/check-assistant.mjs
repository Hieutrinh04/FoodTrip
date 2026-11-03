// Real-backend smoke check using public venue/travel queries only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findFoodAnswer } from '../src/lib/assistantAnswers.js'
import { planTurn, resolveChatTurn } from '../src/lib/assistantConversation.js'
import { placeFollowUp } from '../src/lib/assistantPlaceContext.js'
import { catalogPlace } from '../src/lib/placeCatalog.js'
import { normalise } from '../src/lib/mapAreaSearch.js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).flatMap((line) => {
  const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.+)$/)
  return m ? [[m[1], m[2].trim().replace(/^["']|["']$/g, '')]] : []
}))
async function request(path, body) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/${path}`, {
    method: body ? 'POST' : 'GET', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status}`)
  return res.json()
}
const message = 'các địa chỉ ăn ngon tại Đà Lạt'
const reading = await request('functions/v1/assistant', { message, lang: 'vi' })
assert.equal(reading.intent, 'find_food')
const trip = planTurn('Đà Lạt 2 ngày 2 người', [], null, null).trip
assert.equal(resolveChatTurn(message, reading, { trip }).updatePlan, false)
const rows = await request('rest/v1/rpc/place_catalog', { p_after: '', p_limit: 500 })
const catalog = async () => rows.map(catalogPlace).filter(Boolean)
const reply = await findFoodAnswer(message, [], trip, 'vi', {
  catalog,
  locate: async () => ({ lat: 11.9404, lng: 108.4583 }),
  search: async ({ keyword, origin }) => {
    const params = new URLSearchParams({ q: keyword, lat: origin.lat, lng: origin.lng, radiusKm: '5', pages: '1' })
    const found = await request(`functions/v1/map-place-search?${params}`)
    return { ...found, places: (found.places ?? []).map((p) => normalise(p, { cityId: 'dalat' })) }
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
console.log(JSON.stringify({ checks: 'passed', foodIntent: reading.intent, returnedPlaces: reply.places.map((p) => p.name.vi), referenceResolved: chosen.place.name.vi, assessmentSource: assessment.assessment.source, switchedTopic: faq.intent }, null, 2))
