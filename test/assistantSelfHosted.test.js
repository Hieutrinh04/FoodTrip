import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateReply } from '../supabase/functions/_shared/assistant/generate.js'

const args = { message: 'Email tôi là person@example.com, thanh toán trong bao lâu?', lang: 'vi', history: [], composed: { intent: 'booking_payment', reply: { text: 'Bạn cần thanh toán trong 30 phút.', links: [] } } }
const config = { localUrl: 'https://foodtrip-model.example', localToken: 'server-only-secret' }

test('a self-trained generator works without a commercial API key and receives bounded redacted evidence', async () => {
  let called = 0
  const result = await generateReply(args, { ...config, fetcher: async (url, options) => {
    called++
    assert.equal(url, `${config.localUrl}/generate`)
    assert.equal(options.headers.authorization, `Bearer ${config.localToken}`)
    const body = JSON.parse(options.body)
    assert.equal(body.context.answer, args.composed.reply.text)
    assert.doesNotMatch(options.body, /person@example.com/)
    return { ok: true, json: async () => ({ complete: true, text: 'Bạn thanh toán trong 30 phút nhé.' }) }
  } })
  assert.equal(result, 'Bạn thanh toán trong 30 phút nhé.')
  assert.equal(called, 1)
})

test('self-hosted failures and unsupported policy numbers preserve the original answer without enabling paid fallback', async () => {
  for (const out of [{ text: 'Đợi 60 phút.', complete: true }, { text: 'Đã thanh toán', complete: true }, { text: '30 phút: https://fake.example', complete: true }, { text: '30 phút', complete: false }]) {
    assert.equal(await generateReply(args, { ...config, fetcher: async () => ({ ok: true, json: async () => out }) }), null)
  }
  assert.equal(await generateReply(args, { ...config, fetcher: async () => { throw new Error('offline') } }), null)
})

test('computed account/live-data intents bypass generation and invalid configured endpoints are not called', async () => {
  const unused = () => { throw new Error('must not call') }
  assert.equal(await generateReply({ ...args, composed: { intent: 'booking_status' } }, { ...config, fetcher: unused }), null)
  assert.equal(await generateReply(args, { ...config, localUrl: 'http://untrusted.example', fetcher: unused }), null)
  assert.equal(await generateReply(args, { ...config, localUrl: 'https://secret@host.example', fetcher: unused }), null)
})
