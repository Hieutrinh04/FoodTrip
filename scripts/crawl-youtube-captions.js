// Crawls REAL YouTube video titles/descriptions ("captions") about Vietnamese
// food/travel per city — TikTok has no public search API (see
// tiktok-web-search Edge Function's comment), so YouTube Data API v3 is the
// only platform that can be crawled in bulk without scraping/ToS violation.
//
// Requires YOUTUBE_API_KEY (same key used by the youtube-shorts Edge
// Function — Google Cloud Console → enable "YouTube Data API v3").
//
// Usage: YOUTUBE_API_KEY=... node scripts/crawl-youtube-captions.js
// Output: ml/youtube-captions.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { CITIES } from '../src/data/destinations.js'

const API_KEY = process.env.YOUTUBE_API_KEY
if (!API_KEY) {
  console.error('Missing YOUTUBE_API_KEY env var. Get one from Google Cloud Console (enable "YouTube Data API v3").')
  process.exit(1)
}

const OUT_DIR = new URL('../ml/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })

const QUERY_TEMPLATES = (city) => [`review quán ăn ngon ${city}`, `top quán ăn ${city}`, `ăn gì ở ${city}`]

async function searchVideos(query) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: '25',
    relevanceLanguage: 'vi',
    regionCode: 'VN',
    key: API_KEY,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) {
    console.error(`  query failed (${res.status}): ${query} — ${(await res.text()).slice(0, 200)}`)
    return []
  }
  const json = await res.json()
  return json.items || []
}

const seen = new Set()
const results = []

for (const city of CITIES) {
  console.log(`Crawling YouTube for ${city.name.vi}...`)
  for (const query of QUERY_TEMPLATES(city.name.vi)) {
    const items = await searchVideos(query)
    for (const it of items) {
      const videoId = it.id?.videoId
      if (!videoId || seen.has(videoId)) continue
      seen.add(videoId)
      results.push({
        videoId,
        title: it.snippet?.title ?? '',
        description: it.snippet?.description ?? '',
        city: city.id,
        cityName: city.name.vi,
      })
    }
    // YouTube Data API has a strict daily quota (search.list costs 100 units
    // of the default 10,000/day) — small delay, and this script alone uses
    // ~3600 units per full run across 12 cities x 3 queries.
    await new Promise((r) => setTimeout(r, 150))
  }
  console.log(`  total so far: ${results.length}`)
}

writeFileSync(new URL('youtube-captions.json', OUT_DIR), JSON.stringify(results, null, 2) + '\n', 'utf8')
console.log(`\nDone. ${results.length} real video captions written to ml/youtube-captions.json`)
