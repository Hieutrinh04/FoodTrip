import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'
import { resolveChatTurn } from '../src/lib/assistantConversation.js'
import { findFoodAnswer, tripInContext } from '../src/lib/assistantAnswers.js'
import { normalise } from '../src/lib/mapAreaSearch.js'

test('release questions: booking, saved trips, handoff, modification and dishes', () => {
  const rows = JSON.parse(readFileSync('ml/assistant/real-test.json', 'utf8')).slice(110)
  assert.ok(rows.length >= 18)
  for (const row of rows) assert.equal(ruleIntent(row.text).intent, row.intent, row.text)
  for (const [text, intent] of [
    ['quán bún bò ngon gần đây', 'find_food'],
    ['quét QR báo lỗi', 'booking_payment'],
    ['phở bò là món gì', 'out_of_scope'],
    ['hủy phòng ở Đà Nẵng', 'booking_cancel_refund'],
    ['video review phở Hà Nội', 'share_video'],
    ['phở Hà Nội địa chỉ', 'place_info'],
  ]) assert.equal(ruleIntent(text).intent, intent, text)
})

test('original evaluation sets do not regress below the measured release baseline', () => {
  for (const [name, limit, minimum] of [['test', 585, 533], ['real_test', 110, 102]]) {
    const rows = readFileSync(`ml/assistant/data/${name}.jsonl`, 'utf8').trim().split('\n').map(JSON.parse).slice(0, limit)
    assert.equal(rows.length, limit)
    assert.ok(rows.filter((r) => ruleIntent(r.text).intent === r.intent).length >= minimum, name)
  }
})

test('assistant smoke check succeeds with all network access disabled', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', "globalThis.fetch=()=>{throw new Error('Network forbidden in smoke check')};await import('./scripts/check-assistant.mjs')"], { encoding: 'utf8' })
  const result = JSON.parse(output)
  assert.equal(result.mode, 'offline-fixtures')
  assert.equal(result.checks, 'passed')
})

test('a new dish overrides a pending city clarification, while a bare city completes it', async () => {
  const pending = { intent: 'find_food', need: 'dest', message: 'tìm quán bún chả', slots: [], trip: {} }
  const message = 'quán phở ở Hà Nội'
  const turn = resolveChatTurn(message, ruleIntent(message), { pending })
  assert.equal(turn.follow, false)
  assert.equal(resolveChatTurn('Hà Nội', ruleIntent('Hà Nội'), { pending }).follow, true)
  const trip = tripInContext(message, [])
  const place = normalise({ placeId: 'fixture', name: 'Phở kiểm thử', address: 'Hà Nội', rating: 4.5, ratingCount: 100, location: { lat: 21, lng: 105 } }, { cityId: 'hanoi' })
  const reply = await findFoodAnswer(message, [], trip, 'vi', { catalog: async () => [], locate: async () => place.location, search: async ({ keyword }) => { assert.equal(keyword, 'phở'); return { status: 'ok', places: [place] } } })
  assert.equal(reply.places[0].id, place.id)
})
