import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INTENTS, INTENT_IDS, SLOT_LABELS, intentById } from '../supabase/functions/_shared/assistant/intents.js'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'
import { TEMPLATES, VALUES } from '../ml/assistant/templates.js'
import { labelReal } from '../scripts/generate-assistant-dataset.js'
import { FAQ, faqRetrieve } from '../supabase/functions/_shared/assistant/faq.js'
import { composeReply, faqReply } from '../supabase/functions/_shared/assistant/reply.js'

test('every intent answers, and its links go to pages the site has', () => {
  const routes = [...readFileSync('src/App.jsx', 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1])
  for (const intent of INTENTS) {
    if (intent.id !== 'plan_trip') assert.ok(intent.answer?.vi && intent.answer?.en, `${intent.id} has no answer`)
    for (const link of intent.links ?? []) assert.ok(routes.includes(link.to.split('#')[0]), `${intent.id} links to ${link.to}`)
  }
  assert.equal(new Set(INTENT_IDS).size, INTENT_IDS.length)
  assert.equal(intentById('nonsense').id, 'out_of_scope')
  assert.equal(SLOT_LABELS[0], 'O')
})

test('templates use known intents and slots only', () => {
  for (const [intent, templates] of Object.entries(TEMPLATES)) {
    assert.ok(INTENT_IDS.includes(intent), intent)
    for (const t of templates) for (const [, slot] of t.matchAll(/\{(\w+)\}/g)) assert.ok(VALUES[slot]?.length, `${intent}: {${slot}}`)
  }
})

test('the rule baseline reads common questions', () => {
  const cases = [
    ['cuối tuần đi Đà Lạt 2 người 3 triệu', 'plan_trip'],
    ['huỷ phòng có được hoàn tiền không', 'booking_cancel_refund'],
    ['thanh toán bằng VNPay được không', 'booking_payment'],
    ['quên mật khẩu', 'account'],
    ['đăng ký làm đối tác khách sạn', 'partner'],
    ['xin chào', 'greeting'],
    ['giá vàng hôm nay', 'out_of_scope'],
  ]
  for (const [text, intent] of cases) assert.equal(ruleIntent(text).intent, intent, text)
})

test('hand labels must quote the message exactly', () => {
  const row = labelReal({ text: 'đi Đà Lạt 2 ngày', intent: 'plan_trip', slots: [['DEST', 'Đà Lạt'], ['DURATION', '2 ngày']] })
  assert.deepEqual(row.tags, ['O', 'B-DEST', 'I-DEST', 'B-DURATION', 'I-DURATION'])
  assert.throws(() => labelReal({ text: 'đi Huế', intent: 'plan_trip', slots: [['DEST', 'Đà Lạt']] }), /not found/)
})

test('FAQ entries are complete, and link to real pages', () => {
  const routes = [...readFileSync('src/App.jsx', 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(FAQ.map((e) => e.id)).size, FAQ.length)
  for (const e of FAQ) {
    assert.ok(INTENT_IDS.includes(e.intent), e.id)
    assert.ok(e.q.length >= 2 && e.test && e.a.vi && e.a.en, e.id)
    for (const l of e.links) assert.ok(routes.includes(l.to.split('#')[0]), `${e.id} → ${l.to}`)
  }
})

test('word matching finds an entry by its own phrasing', () => {
  for (const e of FAQ) assert.equal(faqRetrieve(e.q[0])[0].id, e.id, e.q[0])
  assert.deepEqual(faqRetrieve('   '), [])
})

test('the reply is a sure FAQ answer, else the intent answer with related questions', () => {
  const sure = composeReply('giữ phòng bao lâu', { intent: 'booking_payment' })
  assert.equal(sure.faq, 'pay-hold-30')
  assert.match(sure.reply.text, /30 phút/)
  // A trained retriever's hits and threshold are used as given.
  const unsure = composeReply('thanh toán sao', { intent: 'booking_payment' }, 'vi', { hits: [{ id: 'pay-methods', score: 0.4 }, { id: 'pay-hold-30', score: 0.3 }], threshold: 0.8 })
  assert.equal(unsure.faq, null)
  assert.deepEqual(unsure.related.map((r) => r.id), ['pay-methods', 'pay-hold-30'])
  // Trip requests and computed answers never come from the FAQ.
  assert.equal(composeReply('lên lịch 2 ngày Huế', { intent: 'plan_trip' }).action.type, 'plan')
  assert.equal(composeReply('chi phí bao nhiêu', { intent: 'estimate_cost' }).faq, null)
  assert.equal(faqReply('refund-policy', 'en').intent, 'booking_cancel_refund')
  assert.equal(faqReply('nope'), null)
})
