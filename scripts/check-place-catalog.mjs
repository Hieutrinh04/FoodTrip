// End-to-end persistence check with public venue/video data; never prints keys.
// node scripts/check-place-catalog.mjs [public YouTube URL]
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).flatMap((line) => {
  const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.+)$/)
  return m ? [[m[1], m[2].trim().replace(/^["']|["']$/g, '')]] : []
}))
const base = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
if (!base || !key) throw new Error('Missing Supabase public configuration')
async function request(path, body) {
  const res = await fetch(`${base}/${path}`, {
    method: body ? 'POST' : 'GET', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status}`)
  return res.json()
}
async function catalog() {
  const rows = []
  let after = ''
  for (;;) {
    const page = await request('rest/v1/rpc/place_catalog', { p_after: after, p_limit: 500 })
    assert.ok(Array.isArray(page))
    rows.push(...page)
    if (page.length < 500) return rows
    after = page.at(-1).place_id
  }
}
const before = await catalog()
console.log(JSON.stringify({ catalogRows: before.length, uniqueGoogleIds: new Set(before.map((p) => p.place_id)).size }))
const url = process.argv[2]
if (url) {
  const meta = await request(`functions/v1/youtube-oembed?url=${encodeURIComponent(url)}`)
  assert.ok(meta.title, 'Video must have readable public metadata')
  const body = { caption: meta.title, description: meta.description, videoUrl: url }
  const first = await request('functions/v1/detect-place', body)
  assert.ok(first.places?.length, 'Video should identify at least one venue')
  assert.equal(first.catalogueSaved, true, 'Database write must be acknowledged')
  const ids = first.places.filter((p) => !p.placeId.startsWith('map:')).map((p) => p.placeId)
  const after = await catalog()
  for (const id of ids) assert.equal(after.filter((p) => p.place_id === id).length, 1, `Persisted exactly once: ${id}`)
  const second = await request('functions/v1/detect-place', body)
  assert.equal(second.catalogueSaved, true)
  const repeated = await catalog()
  for (const id of ids) assert.equal(repeated.filter((p) => p.place_id === id).length, 1)
  console.log(JSON.stringify({ video: url, candidates: ids.length, persistedExactlyOnce: true, databaseRowsAfter: repeated.length, names: first.places.map((p) => p.name) }))
}
