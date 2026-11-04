import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comparePlaces, nextQuestions, placeFollowUp } from '../src/lib/assistantPlaceContext.js'
import { findFoodAnswer, placeInfoAnswer, requestFromTrip, tripInContext } from '../src/lib/assistantAnswers.js'
import { planTurn } from '../src/lib/assistantConversation.js'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'
import { planFields } from '../src/lib/assistant.js'

const place = (id, city = 'dalat', rating = 4.8, count = 200) => ({ id, city, source: 'google-maps', category: 'food', name: { vi: `Quán ${id}` }, address: { vi: city === 'dalat' ? 'Đà Lạt' : 'Hà Nội' }, shortDesc: { vi: '' }, location: { lat: 11.94, lng: 108.44 }, googleRating: rating, googleRatingCount: count })
const trip = planTurn('Đà Lạt 2 ngày 2 người', [], null, null).trip
const search = { message: 'tìm quán ăn ở Đà Lạt', slots: [], trip }
const places = [place('a'), place('b'), place('c')]
const history = [{ from: 'bot', places, foodSearch: search }]

test('place references use the numbered list and retain selected focus on the next turn', () => {
  const second = placeFollowUp('đánh giá quán thứ hai', history)
  assert.equal(second.type, 'assessment')
  assert.equal(second.place.id, 'b')
  const focused = [...history, { from: 'bot', focusPlace: places[1] }]
  assert.equal(placeFollowUp('quán đó mở cửa mấy giờ?', focused).place.id, 'b')
  assert.equal(placeFollowUp('địa chỉ quán thứ ba', focused).place.id, 'c')
  assert.equal(placeFollowUp('quán thứ 9', history).type, 'clarify')
  assert.equal(placeFollowUp('đánh giá quán đó', history).type, 'clarify')
  assert.equal(placeFollowUp('huỷ phòng được hoàn tiền không', history), null)
  assert.equal(placeFollowUp('thời tiết Hà Nội', history), null)
  assert.equal(placeFollowUp('quán thứ hai', []).type, 'clarify')
})

test('more places keeps the dish and destination, and excludes every venue already listed', () => {
  const follow = placeFollowUp('còn quán khác không?', [...history, { from: 'bot', places: [place('d')], foodSearch: search }])
  assert.equal(follow.type, 'more')
  assert.deepEqual(follow.search, search)
  assert.deepEqual(follow.excludeIds, ['a', 'b', 'c', 'd'])
  assert.equal(placeFollowUp('còn quán khác ở Hà Nội', history), null, 'explicit new city must be handled as a new search')
})

test('comparison provides evidence without inventing menu prices or a personal best choice', () => {
  assert.equal(placeFollowUp('so sánh các quán này', history).type, 'compare')
  const text = comparePlaces(places).text
  assert.match(text, /4.8\/5/)
  assert.match(text, /chưa có giá món đã xác minh/)
  assert.deepEqual(nextQuestions({ places: [place('a')] }), ['Đánh giá quán thứ nhất', 'Còn quán khác không?'])
})

test('three saved venues answer directly without another paid map search and exclude the wrong city', async () => {
  const out = await findFoodAnswer('các địa chỉ ăn ngon tại Đà Lạt', [], trip, 'vi', {
    catalog: async () => [...places, place('hn', 'hanoi', 5, 10000)],
    search: async () => { throw new Error('must not search') },
    locate: async () => { throw new Error('must not geocode') },
  })
  assert.equal(out.places.length, 3)
  assert.equal(out.places.some((p) => p.city === 'hanoi'), false)
  assert.match(out.text, /quán đã lưu/)
})

test('DB fallback survives map-provider failures and never mixes a different dish into the answer', async () => {
  const pho = { ...place('pho'), name: { vi: 'Phở kiểm thử' } }
  const out = await findFoodAnswer('quán phở ngon ở Đà Lạt', [], trip, 'vi', {
    catalog: async () => [pho, place('other-dish')], locate: async () => ({ lat: 11.94, lng: 108.44 }),
    search: async () => { throw new Error('network') },
  })
  assert.deepEqual(out.places.map((p) => p.id), ['pho'])
})

test('load more never repeats a listed restaurant, including when all candidates are exhausted', async () => {
  const out = await findFoodAnswer(search.message, [], trip, 'vi', {
    catalog: async () => places, excludeIds: ['a', 'b', 'c'], locate: async () => ({ lat: 11.94, lng: 108.44 }), search: async () => ({ places }),
  })
  assert.equal(out.places, undefined)
  assert.match(out.text, /chưa tìm thêm/)
})

test('selected restaurant lookup uses its exact address and coordinates for branch disambiguation', async () => {
  const selected = places[1]
  let args
  const reply = await placeInfoAnswer(selected.name.vi, trip, 'vi', { selected, load: async (input) => {
    args = input
    return { status: 'ok', place: { name: selected.name.vi, address: selected.address.vi, rating: 4.8, ratingCount: 200 } }
  } })
  assert.equal(args.address, selected.address.vi)
  assert.deepEqual(args.location, selected.location)
  assert.match(reply.text, /Quán b/)
})

test('deictic destination references preserve the city and planner handoff keeps the stated dates', () => {
  const current = tripInContext('tìm quán ăn ở đó', [], trip)
  assert.equal(current.cityId, 'dalat')
  assert.notEqual(current.destinationQuery, 'đó')
  assert.equal(tripInContext('tìm quán ở đó', [], null).destinationQuery, null)
  assert.match(requestFromTrip({ ...trip, mentioned: { dates: ['cuối tuần này'] } }), /cuối tuần này/)
})

test('English suggestions route to food/weather/cost instead of the generic fallback', () => {
  assert.equal(ruleIntent('Good phở in Hanoi').intent, 'find_food')
  assert.equal(ruleIntent('What to eat in Da Lat?').intent, 'find_food')
  assert.equal(ruleIntent('How much for 3 days in Hoi An for 2?').intent, 'estimate_cost')
  assert.equal(ruleIntent('Weather in Da Lat this weekend').intent, 'ask_weather')
  assert.equal(ruleIntent('When does Phở Thìn Lò Đúc open?').intent, 'place_info')
  const fields = planFields('Plan 3 days in Da Lat, 2 people, 3 million, motorbike')
  assert.equal(fields.duration, 3)
  assert.equal(fields.people, 2)
  assert.equal(fields.budgetPerPerson, 3000000)
  assert.equal(fields.transport, 'bike')
})
