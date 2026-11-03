import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frontendNames, checkEnvironment, scanArtifact, codeWarnings, formatPreflight } from '../scripts/preflight.mjs'

test('preflight discovers frontend names and checks presence without retaining values', () => {
  const names = frontendNames(["const env = import.meta.env ?? {}; env.VITE_SUPABASE_URL; env.VITE_SUPABASE_ANON_KEY", 'import.meta.env?.VITE_TRACK_ASIA_API_KEY; import.meta.env.VITE_TRACK_ASIA_API_KEY_BACKUP; import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY'])
  assert.equal(names.length, 5)
  const result = checkEnvironment(names, { VITE_SUPABASE_URL: 'private-test-value', VITE_SUPABASE_ANON_KEY: '   ' })
  assert.deepEqual(result.find((r) => r.name === 'VITE_SUPABASE_URL'), { name: 'VITE_SUPABASE_URL', present: true, required: true })
  assert.equal(result.find((r) => r.name === 'VITE_SUPABASE_ANON_KEY').present, false)
  assert.equal(result.find((r) => r.name === 'VITE_TRACK_ASIA_API_KEY').required, false)
  assert.doesNotMatch(JSON.stringify(result), /private-test-value/)
})

test('preflight scans artifacts for all requested markers but never echoes credential contents', () => {
  const secret = 'sk-ant-do-not-print-this-fixture'
  const findings = scanArtifact('dist/assets/app.js', Buffer.from(`HOTELBEDS SERPER SERVICE_ROLE ANTHROPIC ${secret}`))
  assert.equal(findings.length, 5)
  const output = formatPreflight({ environment: [], artifactCount: 1, findings, warnings: [], errors: ['review required'] })
  assert.match(output, /NOT READY/)
  assert.doesNotMatch(output, /do-not-print-this-fixture/)
  assert.deepEqual(scanArtifact('dist/index.html', '<title>FoodTrip</title>'), [])
})

test('preflight warns from code without querying payment state or assuming production readiness', () => {
  const warnings = codeWarnings({ hotelbeds: 'api.test.hotelbeds.com', vnpay: 'sandbox.vnpayment.vn', sepay: 'sepay_mock_enabled' })
  assert.equal(warnings.length, 3)
  assert.match(warnings.join('\n'), /NOT queried/)
  assert.deepEqual(codeWarnings({}), [])
})
