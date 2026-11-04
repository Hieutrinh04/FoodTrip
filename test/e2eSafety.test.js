import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireLocalSupabase } from '../scripts/e2e-safety.mjs'

test('E2E refuses remote, missing, malformed, lookalike and credential-bearing backend URLs', () => {
  for (const value of [undefined, '', 'not-a-url', 'https://example.supabase.co', 'https://localhost.evil.test', 'http://127.0.0.1.evil.test', 'file:///localhost', 'http://user:password@localhost', 'http://[::1]:54321']) assert.throws(() => requireLocalSupabase(value), /E2E dừng/)
  assert.equal(requireLocalSupabase('http://localhost:54321'), 'http://localhost:54321')
  assert.equal(requireLocalSupabase('http://127.0.0.1:54329'), 'http://127.0.0.1:54329')
})
