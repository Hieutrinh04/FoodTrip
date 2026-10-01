// Crawls the real data the NER model trains on, through FoodTrip's own
// deployed Edge Functions instead of calling Google and YouTube directly.
//
// crawl-real-places.js and crawl-youtube-captions.js need a Google Places
// server key and a YouTube Data API key on this machine. The first needs a
// billing-enabled Google Cloud project; the second only exists as a Supabase
// secret. The Edge Functions already hold working keys server-side, so this
// script produces the same two files through them, with nothing secret here.
//
//   ml/real-places.json      real businesses from Google Maps (via Serper),
//                            names reduced to the venue's real name
//   ml/youtube-captions.json real YouTube titles + descriptions about those
//                            businesses — each one already verified by the
//                            youtube-shorts function to name the venue in its
//                            title and the city somewhere in the text
//
// Then: node scripts/build-real-ner-dataset.js
//
// Cost, per full run: 36 map searches (≈108 Serper credits) and up to
// 12 × VIDEO_PLACES_PER_CITY YouTube searches (≈101 quota units each, from a
// 10,000/day allowance shared with the live site). Keep VIDEO_PLACES_PER_CITY
// modest, or run on a day the site is not being demonstrated.
//
// Usage: node scripts/crawl-via-supabase.js [videoPlacesPerCity]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { CITIES } from '../src/data/destinations.js'
import { primaryPlaceName } from '../src/lib/text.js'

const VIDEO_PLACES_PER_CITY = Number(process.argv[2]) || 5
const OUT_DIR = new URL('../ml/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })

function envValue(name) {
  if (process.env[name]) return process.env[name].trim()
  const file = new URL('../.env.local', import.meta.url)
  if (!existsSync(file)) return null
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`))
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const SUPABASE_URL = envValue('VITE_SUPABASE_URL')
const ANON_KEY = envValue('VITE_SUPABASE_ANON_KEY')
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env.local.')
  process.exit(1)
}

async function callFunction(path) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`${path.split('?')[0]} → HTTP ${res.status}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PLACE_QUERIES = ['quán ăn ngon', 'quán cà phê', 'nhà hàng đặc sản']

function categoryOf(place) {
  const text = `${place.category ?? ''} ${(place.categories ?? []).join(' ')}`.toLowerCase()
  if (/cà phê|cafe|coffee|trà/.test(text)) return 'cafe'
  if (/nhà hàng|quán|ăn|restaurant|food|bún|phở|lẩu/.test(text)) return 'food'
  return 'attraction'
}

// ---------- 1. Real places ----------
const seen = new Set()
const places = []
for (const city of CITIES) {
  const cityName = city.name.vi
  process.stdout.write(`Địa điểm · ${cityName.padEnd(16)}`)
  for (const q of PLACE_QUERIES) {
    try {
      const json = await callFunction(`map-place-search?${new URLSearchParams({ q: `${q} ${cityName}`, pages: '1' })}`)
      for (const p of json.places ?? []) {
        const name = primaryPlaceName(p.name ?? '').trim()
        const key = p.placeId ?? `${name}@${cityName}`
        // A one-word name is too generic to be a trustworthy entity label.
        if (!name || name.split(/\s+/).length < 2 || seen.has(key)) continue
        seen.add(key)
        places.push({
          id: p.placeId ?? key,
          name,
          address: p.address ?? '',
          city: city.id,
          cityName,
          category: categoryOf(p),
          ratingCount: p.ratingCount ?? 0,
        })
      }
    } catch (error) {
      process.stdout.write(`[${error.message}] `)
    }
    await sleep(300)
  }
  console.log(`→ tổng ${places.length}`)
}
writeFileSync(new URL('real-places.json', OUT_DIR), JSON.stringify(places, null, 2) + '\n', 'utf8')
console.log(`\n${places.length} địa điểm thật → ml/real-places.json\n`)

// ---------- 2. Real video captions about those places ----------
const captions = []
const seenVideos = new Set()
for (const city of CITIES) {
  const cityName = city.name.vi
  // The best-known places are the ones people actually film.
  const picks = places
    .filter((p) => p.city === city.id)
    .sort((a, b) => b.ratingCount - a.ratingCount)
    .slice(0, VIDEO_PLACES_PER_CITY)
  process.stdout.write(`Video · ${cityName.padEnd(16)}`)
  for (const place of picks) {
    try {
      const params = new URLSearchParams({ query: `${place.name} ${cityName}`, name: place.name, location: cityName })
      const json = await callFunction(`youtube-shorts?${params}`)
      for (const v of json.videos ?? []) {
        if (!v.videoId || seenVideos.has(v.videoId)) continue
        seenVideos.add(v.videoId)
        captions.push({
          videoId: v.videoId,
          title: v.title ?? '',
          description: v.description ?? '',
          city: city.id,
          cityName,
          // The venue the function verified this video is about.
          placeName: place.name,
        })
      }
    } catch (error) {
      process.stdout.write(`[${error.message}] `)
      if (/403|429/.test(error.message)) break // quota spent — stop instead of hammering
    }
    await sleep(400)
  }
  console.log(`→ tổng ${captions.length}`)
}
writeFileSync(new URL('youtube-captions.json', OUT_DIR), JSON.stringify(captions, null, 2) + '\n', 'utf8')
console.log(`\n${captions.length} caption video thật → ml/youtube-captions.json`)
console.log('Tiếp theo: node scripts/build-real-ner-dataset.js')
