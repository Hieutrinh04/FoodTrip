import test from 'node:test'
import assert from 'node:assert/strict'

import { findPaymentCode, isSepayRequest, sepayConfig, sepayQrUrl, sepayTime } from '../supabase/functions/_shared/sepay.ts'

const env = (values) => ({ get: (name) => values[name] })

test('the payment code is found however the bank mangled the transfer note', () => {
  assert.equal(findPaymentCode({ content: 'FT3A9C0E12B7 chuyen tien' }), 'FT3A9C0E12B7')
  assert.equal(findPaymentCode({ content: 'MBVCB.3278 ft3a9c0e12b7 NGUYEN VAN A' }), 'FT3A9C0E12B7')
  // Some banks break the note into chunks.
  assert.equal(findPaymentCode({ content: 'FT3A9C 0E12B7' }), 'FT3A9C0E12B7')
  // SePay's own detected code wins when it has one.
  assert.equal(findPaymentCode({ code: 'FT00000000AA', content: 'FT11111111BB' }), 'FT00000000AA')
  assert.equal(findPaymentCode({ content: 'chuyen tien an trua' }), null)
})

test('only a request with our key counts as SePay', () => {
  assert.ok(isSepayRequest('Apikey s3cret-key', 's3cret-key'))
  assert.ok(isSepayRequest('apikey   s3cret-key ', 's3cret-key'))
  assert.ok(!isSepayRequest('Apikey wrong', 's3cret-key'))
  assert.ok(!isSepayRequest('Bearer s3cret-key', 's3cret-key'))
  assert.ok(!isSepayRequest(null, 's3cret-key'))
  assert.ok(!isSepayRequest('Apikey ', ''))
})

test('payments are off until the key and the receiving account are configured', () => {
  assert.equal(sepayConfig(env({ SEPAY_WEBHOOK_KEY: 'k' })), null)
  assert.deepEqual(
    sepayConfig(env({ SEPAY_WEBHOOK_KEY: 'k', SEPAY_BANK: 'MBBank', SEPAY_ACCOUNT_NUMBER: '0123', SEPAY_ACCOUNT_NAME: 'FOODTRIP' })),
    { webhookKey: 'k', bank: 'MBBank', accountNumber: '0123', accountName: 'FOODTRIP' },
  )
})

test('the QR carries the account, the exact amount and the code', () => {
  const url = new URL(sepayQrUrl({ bank: 'MBBank', accountNumber: '0123', amount: 1050000, content: 'FT3A9C0E12B7' }))
  assert.equal(url.origin + url.pathname, 'https://qr.sepay.vn/img')
  assert.equal(url.searchParams.get('acc'), '0123')
  assert.equal(url.searchParams.get('amount'), '1050000')
  assert.equal(url.searchParams.get('des'), 'FT3A9C0E12B7')
})

test('SePay times are Vietnam local time', () => {
  assert.equal(sepayTime('2026-09-25 14:02:37'), '2026-09-25T07:02:37.000Z')
  assert.equal(sepayTime('yesterday'), null)
})
