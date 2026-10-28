// Read-only DB integration check. Scoring uses actual saved venues; route and
// enrichment providers are disabled here to avoid unrelated paid lookups.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { fetchPlaceCatalog } from '../src/lib/placeCatalog.js'
import { loadPlannerCatalog } from '../src/lib/plannerCatalog.js'
import { generateItinerary } from '../src/lib/itineraryEngine.js'
import { getPlace } from '../src/data/destinations.js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).flatMap((line) => {
  const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.+)$/)
  return m ? [[m[1], m[2].trim().replace(/^["']|["']$/g, '')]] : []
}))
const load = () => fetchPlaceCatalog({ rpc: async (body) => {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/place_catalog`, {
    method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`catalogue HTTP ${res.status}`)
  return { data: await res.json() }
} })
let pool, saved
const days = await generateItinerary({ cityId: 'dalat', duration: 1, budget: 1500000, prefs: [], transport: 'bike', onCandidates: (p) => { pool = p }, onCatalog: (c) => { saved = c } }, {
  loadCatalog: (destination) => loadPlannerCatalog(destination, { load }),
  expand: async (_city, p) => p,
  enrich: async () => null,
  route: async () => null,
})
assert.equal(saved.status, 'ready')
assert.ok(saved.places.length > 0)
assert.ok(pool.some((p) => p.inCatalog))
const chosen = days.flat().filter((s) => s.placeSnapshot?.inCatalog)
assert.ok(chosen.length > 0, 'Real DB venue should be eligible and selected')
console.log(JSON.stringify({ destination: 'Đà Lạt', savedCandidates: saved.places.length, totalCandidates: pool.length, selectedSavedPlaces: chosen.map((s) => ({ name: getPlace(s.placeId).name.vi, googleRating: s.liveRating, googleReviewCount: s.liveReviewCount })) }, null, 2))
