import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dishLedSearch } from '../supabase/functions/_shared/assistant/dishRequest.js'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'
import { askedDish, findFoodAnswer } from '../src/lib/assistantAnswers.js'

const food = [
  ['nem lụi Huế', 'nem lụi'],
  ['chả cá Hà Nội', 'chả cá'],
  ['trà sữa Hà Nội', 'trà sữa'],
  ['gỏi cuốn ở TP.HCM', 'gỏi cuốn'],
  ['bánh tráng nướng Đà Lạt', 'bánh tráng nướng'],
  ['hôm nay ăn bún chả ở Hà Nội', 'bún chả'],
  ['cho mình hỏi phở Hà Nội', 'phở'],
  ['phở gần đây', 'phở'],
  ['bún bò Huế', 'bún bò'],
  // Additional foods/combinations not enumerated as whole dish names.
  ['bánh bột lọc tại Huế', 'bánh bột lọc'],
  ['chè bưởi Cần Thơ', 'chè bưởi'],
  ['bò né Sài Gòn', 'bò né'],
  ['cho tôi hỏi gỏi đu đủ ở Đà Nẵng', 'gỏi đu đủ'],
  ['hôm nay mình ăn nem nướng ở Nha Trang', 'nem nướng'],
  ['cháo sườn ở Hà Nội', 'cháo sườn'],
  ['xôi xéo Hà Nội', 'xôi xéo'],
  ['trà đào gần tôi', 'trà đào'],
  ['GỎI CUỐN tại TP. Hồ Chí Minh!', 'GỎI CUỐN'],
  ['bun cha o Ha Noi', 'bun cha'],
]

const notFood = [
  'pho co Ha Noi', 'pho co Hoi An', 'phố Hà Nội', 'phố cổ Hà Nội',
  'phở bò là món gì', 'phở là gì', 'Hải Phòng', 'hải sản có đắt không',
  // Further destination-only, arbitrary noun, explanation and ambiguous queries.
  'máy tính ở Hà Nội', 'xe máy Huế', 'Hội An', 'Huế', 'ở Hà Nội thì sao',
  'pho Ha Noi', 'pho gần đây', 'bánh tráng nướng ở đâu',
  'trà sữa ở Hà Nội thì sao', 'cách nấu gỏi cuốn ở TP.HCM',
  'một câu bất kỳ ở Hà Nội', 'laptop tại Đà Lạt',
]

const otherIntents = [
  ['thời tiết Hà Nội', 'ask_weather'],
  ['lên lịch 2 ngày ở Hội An', 'plan_trip'],
  ['tour Đà Nẵng', 'tour_info'],
  ['hủy phòng ở Đà Nẵng', 'booking_cancel_refund'],
  ['video review phở Hà Nội', 'share_video'],
  ['phở Hà Nội địa chỉ', 'place_info'],
  ['tour nem lụi Huế', 'tour_info'],
  ['thời tiết khi ăn bún chả Hà Nội', 'ask_weather'],
  ['huỷ phòng gần đây', 'booking_cancel_refund'],
]

test('dish sentence grammar recognizes short food families with a full destination or nearby suffix', () => {
  for (const [message, dish] of food) {
    assert.equal(dishLedSearch(message), dish, message)
    assert.equal(askedDish(message, []), dish, message)
    assert.equal(ruleIntent(message).intent, 'find_food', message)
  }
})

test('dish grammar rejects streets, definitions, destinations, arbitrary nouns and ambiguous bare pho', () => {
  for (const message of notFood) {
    assert.equal(dishLedSearch(message), null, message)
    assert.equal(askedDish(message, []), null, message)
    assert.notEqual(ruleIntent(message).intent, 'find_food', message)
  }
})

test('other explicit intents take precedence over dish mentions', () => {
  for (const [message, intent] of otherIntents) {
    assert.equal(ruleIntent(message).intent, intent, message)
    assert.equal(askedDish(message, []), null, message)
  }
})

test('new dish grammar actually filters fake DB and provider candidates by the extracted dish', async () => {
  const venue = (id, name, extra = {}) => ({ id, name: { vi: name }, address: { vi: 'Hà Nội' }, city: 'hanoi', category: 'food', googleRating: 4.8, googleRatingCount: 300, ...extra })
  for (const [message, dish] of food.filter(([text]) => !/gần (đây|tôi)/.test(text))) {
    for (const db of [false, true]) {
      const candidates = [venue('wrong', 'Bún Thang Thanh Thanh'), venue('named', `${dish} kiểm thử`), venue('menu', 'Bếp kiểm thử', { menu: [{ name: dish }] })]
      const options = { catalog: async () => db ? candidates : [], locate: async () => ({ lat: 21, lng: 105 }), search: async ({ keyword }) => {
        assert.equal(keyword, dish, message)
        return { places: db ? [] : candidates }
      } }
      const result = await findFoodAnswer(message, [], { cityId: 'hanoi' }, 'vi', options)
      assert.deepEqual(result.places.map((p) => p.id), ['named', 'menu'], `${message}, DB=${db}`)
      const empty = await findFoodAnswer(message, [], { cityId: 'hanoi' }, 'vi', { ...options, catalog: async () => [], search: async () => ({ places: [candidates[0]] }) })
      assert.equal(empty.places, undefined, message)
      assert.ok(empty.text.includes(dish), message)
    }
  }
})

test('nearby dish search preserves the dish and uses the existing consent-based Nearby entry, never a stale city', async () => {
  const forbidden = async () => { assert.fail('Nearby handoff must not query a catalogue, provider or location') }
  for (const lang of ['vi', 'en']) for (const trip of [{}, { cityId: 'hanoi' }]) {
    const result = await findFoodAnswer('phở gần đây', [], trip, lang, { catalog: forbidden, locate: forbidden, search: forbidden })
    assert.equal(result.places, undefined)
    assert.equal(result.need, undefined)
    assert.equal(result.links[0].to, '/nearby')
    assert.match(result.links[0].label, /phở/)
    assert.match(result.text, /phở/)
    assert.match(result.text, lang === 'vi' ? /cho phép vị trí/ : /allow location/)
  }
})
