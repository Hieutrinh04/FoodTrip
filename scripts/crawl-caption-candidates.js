// Step 1 of ml/training/CRITERIA.md — more REAL captions to label, with a
// credit budget. Two sources:
//
//   tiktok   Real TikTok captions about real venues (ml/real-places.json),
//            through FoodTrip's deployed tiktok-web-search Edge Function
//            (≈2 Serper credits per venue the first time; cached after).
//            Mostly captions that DO name a venue.
//   generic  Google video results (Serper /videos, 1 credit per query) for
//            everyday food and travel topics: vlogs, recipes, "what to eat"
//            lists. Mostly captions that name NO venue — the negatives the
//            model has never seen. Needs SERPER_API_KEY in .env.local.
//
// Output: ml/candidates/captions-<date>.json — unlabelled; the next step is a
// suggested labelling and a human review (ml/review/).
//
// Usage: node scripts/crawl-caption-candidates.js [--venues 20] [--queries 20]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tokenizeCaption } from './lib/captionTokens.js'

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : fallback }
const VENUES = arg('venues', 20)
const QUERIES = arg('queries', 20)

function env(name) {
  if (process.env[name]) return process.env[name].trim()
  const file = new URL('../.env.local', import.meta.url)
  if (!existsSync(file)) return null
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : null
}

const ml = new URL('../ml/', import.meta.url)
const canonical = (s) => tokenizeCaption(s).join(' ').toLowerCase()

// Every caption already in the dataset or an earlier candidate file is skipped.
const known = new Set()
for (const split of ['train', 'val', 'test', 'val_template', 'test_template']) {
  const file = new URL(`colab-package/data/${split}.jsonl`, ml)
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) known.add(JSON.parse(line).tokens.join(' ').toLowerCase())
}
mkdirSync(new URL('candidates/', ml), { recursive: true })

const out = []
const add = (c) => {
  const text = c.text.replace(/\s+/g, ' ').trim()
  if (text.length < 15 || text.length > 300) return
  const key = canonical(text)
  if (known.has(key)) return
  known.add(key)
  out.push({ ...c, text })
}

// --- tiktok: popular venues, spread over the cities, deterministic order ---
const supabaseUrl = env('VITE_SUPABASE_URL'), anon = env('VITE_SUPABASE_ANON_KEY')
const used = new Set()
for (const split of ['train', 'val', 'test']) {
  const file = new URL(`colab-package/data/${split}.jsonl`, ml)
  if (existsSync(file)) for (const line of readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) for (const name of JSON.parse(line).group_names ?? []) used.add(name)
}
const places = JSON.parse(readFileSync(new URL('real-places.json', ml), 'utf8'))
const byCity = {}
for (const p of places.filter((p) => p.name && !used.has(p.name)).sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0))) (byCity[p.cityName] ??= []).push(p)
const picked = []
for (let round = 0; picked.length < VENUES && Object.values(byCity).some((l) => l.length > round); round++) {
  for (const list of Object.values(byCity)) if (list[round] && picked.length < VENUES) picked.push(list[round])
}
let tiktokCalls = 0
for (const place of picked) {
  const params = new URLSearchParams({ query: `${place.name} ${place.cityName}`, name: place.name, location: place.cityName, address: place.address ?? '' })
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/tiktok-web-search?${params}`, { headers: { authorization: `Bearer ${anon}`, apikey: anon }, signal: AbortSignal.timeout(60000) })
    tiktokCalls++
    const data = await res.json()
    for (const v of data.videos ?? []) add({ source: 'tiktok', text: v.title ?? '', url: v.videoUrl, venue: place.name, city: place.cityName })
    console.log(`tiktok  ${place.name} (${place.cityName}): ${data.videos?.length ?? 0} videos [${res.headers.get('server-timing') ?? ''}]`)
  } catch (e) { console.warn(`tiktok  ${place.name}: ${e.message}`) }
}

// --- generic: everyday food & travel video topics ---
const serperKey = env('SERPER_API_KEY')
const cities = [...new Set(places.map((p) => p.cityName))]
const TOPICS = [
  (c) => `vlog du lịch ${c}`, (c) => `ăn gì ở ${c}`, (c) => `đặc sản ${c} nên thử`, (c) => `${c} có gì chơi`,
  () => 'cách làm bánh xèo miền tây tại nhà', () => 'công thức nấu phở bò', () => 'mukbang ăn vặt đường phố việt nam',
  () => 'review đồ ăn vặt cổng trường', () => 'kinh nghiệm du lịch tự túc tiết kiệm', () => 'món ngon mỗi ngày cơm nhà',
]
const queries = []
for (let i = 0; queries.length < QUERIES && i < TOPICS.length * cities.length; i++) {
  const topic = TOPICS[i % TOPICS.length]
  const q = topic(cities[Math.floor(i / TOPICS.length) % cities.length])
  if (!queries.includes(q)) queries.push(q)
}
let serperCalls = 0
if (!serperKey && QUERIES > 0) console.warn('generic: no SERPER_API_KEY in .env.local — skipped')
for (const q of serperKey ? queries : []) {
  const res = await fetch('https://google.serper.dev/videos', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-API-KEY': serperKey },
    body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 20 }), signal: AbortSignal.timeout(20000),
  })
  serperCalls++
  if (!res.ok) { console.warn(`generic "${q}": ${res.status} ${(await res.text()).slice(0, 120)}`); if ([400, 401, 402, 403, 429].includes(res.status)) break; continue }
  const items = (await res.json()).videos ?? []
  for (const it of items) add({ source: 'generic', text: it.title ?? '', url: it.link, query: q })
  console.log(`generic "${q}": ${items.length} results`)
}

const file = new URL(`candidates/captions-${new Date().toISOString().slice(0, 10)}.json`, ml)
writeFileSync(file, JSON.stringify({ created: new Date().toISOString(), tokenizer: 2, budget: { tiktokCalls, serperCalls, approxCredits: tiktokCalls * 2 + serperCalls }, items: out }, null, 1))
console.log(`\n${out.length} new captions (${out.filter((c) => c.source === 'tiktok').length} TikTok, ${out.filter((c) => c.source === 'generic').length} generic) → ${file.pathname}`)
console.log(`≈ ${tiktokCalls * 2 + serperCalls} Serper credits at most (TikTok searches already cached cost nothing)`)
