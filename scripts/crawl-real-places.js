// Crawls REAL place names (Google Places Text Search) across the app's 12
// curated cities, to replace the fictional 59-place seed dataset as the
// source of entities for NER training — the caption *sentences* are still
// template-generated (see build-real-ner-dataset.js), but the business
// names/locations being labeled are now real, verifiable places.
//
// Requires GOOGLE_PLACES_SERVER_KEY (same server-restricted key used by the
// verify-place Edge Function — get one at console.cloud.google.com, enable
// "Places API (New)", restrict by IP not HTTP referrer).
//
// Usage: GOOGLE_PLACES_SERVER_KEY=... node scripts/crawl-real-places.js
// Output: ml/real-places.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { CITIES } from '../src/data/destinations.js'

const API_KEY = process.env.GOOGLE_PLACES_SERVER_KEY
if (!API_KEY) {
  console.error('Missing GOOGLE_PLACES_SERVER_KEY env var. Get one from Google Cloud Console (enable "Places API (New)").')
  process.exit(1)
}

const OUT_DIR = new URL('../ml/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })

// Multiple phrasings per category widen the top-20 result set Google
// returns per query (the New Places API has no pageToken), so we get more
// distinct real places per city instead of the same 20 every time.
const QUERY_TEMPLATES = {
  food: (city) => [`quán ăn ngon ở ${city}`, `quán ăn gia đình ở ${city}`, `đặc sản ${city}`],
  cafe: (city) => [`quán cà phê ở ${city}`, `cà phê view đẹp ${city}`],
  attraction: (city) => [`địa điểm tham quan ${city}`, `địa điểm check-in ${city}`],
}

async function searchText(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'vi', maxResultCount: 20 }),
  })
  if (!res.ok) {
    console.error(`  query failed (${res.status}): ${query}`)
    return []
  }
  const json = await res.json()
  return json.places || []
}

function mapCategory(types) {
  if (types?.some((t) => t.includes('cafe') || t.includes('coffee'))) return 'cafe'
  if (types?.some((t) => t.includes('restaurant') || t.includes('food') || t.includes('meal'))) return 'food'
  return 'attraction'
}

const seen = new Set()
const results = []

for (const city of CITIES) {
  console.log(`Crawling ${city.name.vi}...`)
  for (const buildQueries of Object.values(QUERY_TEMPLATES)) {
    for (const query of buildQueries(city.name.vi)) {
      const places = await searchText(query)
      for (const p of places) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        results.push({
          id: p.id,
          name: p.displayName?.text ?? '',
          address: p.formattedAddress ?? '',
          city: city.id,
          cityName: city.name.vi,
          category: mapCategory(p.types),
        })
      }
      // Be polite / stay well under quota — Places Text Search is billed per request.
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  console.log(`  total so far: ${results.length}`)
}

writeFileSync(new URL('real-places.json', OUT_DIR), JSON.stringify(results, null, 2) + '\n', 'utf8')
console.log(`\nDone. ${results.length} real places across ${CITIES.length} cities written to ml/real-places.json`)
