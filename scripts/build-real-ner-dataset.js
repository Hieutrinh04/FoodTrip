// Combines the two crawled real-data sources into the NER training set,
// replacing the fully-synthetic dataset from generate-ner-dataset.js with
// one grounded in real business names and (where matched) real captions:
//
//   1. Template captions built from REAL place names (ml/real-places.json)
//      — same caption-style sentences as before, but the entity being
//      labeled is now a verifiable real business, not a fictional one.
//   2. REAL YouTube video titles/descriptions (ml/youtube-captions.json),
//      auto-labeled by substring-matching against the real place list —
//      distant/weak supervision: a caption is kept only if at least one
//      known real place (or the city name) appears in it, since an
//      unmatched caption gives no training signal for this task.
//
// Run crawl-real-places.js and crawl-youtube-captions.js first. Either
// input is optional — the script degrades gracefully (skips that source)
// if a file is missing, so you can run with just one crawl done.
//
// Usage: node scripts/build-real-ner-dataset.js
// Output: ml/ner-dataset/{train,val,test}.jsonl + labels.json (overwrites
// the synthetic version from generate-ner-dataset.js)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const ML_DIR = new URL('../ml/', import.meta.url)
const OUT_DIR = new URL('../ml/ner-dataset/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })

const LABELS = ['O', 'B-BUSINESS', 'I-BUSINESS', 'B-LOC', 'I-LOC']

let seed = 42
function rand() {
  seed = (seed * 9301 + 49297) % 233280
  return seed / 233280
}
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function tokenize(text) {
  const tokens = []
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue
    const m = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
    const [, lead, core, trail] = m
    if (lead) tokens.push(lead)
    if (core) tokens.push(core)
    if (trail) tokens.push(trail)
  }
  return tokens
}

function tagCaption(text, entities) {
  const tokens = tokenize(text)
  const tags = new Array(tokens.length).fill('O')
  for (const { text: spanText, label } of entities) {
    const spanTokens = tokenize(spanText)
    if (!spanTokens.length) continue
    for (let i = 0; i <= tokens.length - spanTokens.length; i++) {
      let match = true
      for (let j = 0; j < spanTokens.length; j++) {
        if (tokens[i + j].toLowerCase() !== spanTokens[j].toLowerCase()) {
          match = false
          break
        }
      }
      if (match && tags[i] === 'O') {
        tags[i] = `B-${label}`
        for (let j = 1; j < spanTokens.length; j++) tags[i + j] = `I-${label}`
        break
      }
    }
  }
  return { tokens, tags }
}

function loadJson(name) {
  const path = new URL(name, ML_DIR)
  if (!existsSync(path)) {
    console.warn(`  (skipping — ${name} not found; run the matching crawl-*.js script first)`)
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

console.log('Loading crawled sources...')
const realPlaces = loadJson('real-places.json')
const youtubeCaptions = loadJson('youtube-captions.json')

if (!realPlaces && !youtubeCaptions) {
  console.error('\nNeither ml/real-places.json nor ml/youtube-captions.json exists. Run the crawl scripts first:')
  console.error('  node scripts/crawl-via-supabase.js   (no keys needed on this machine)')
  console.error('or, with your own Google Places / YouTube keys:')
  console.error('  GOOGLE_PLACES_SERVER_KEY=... node scripts/crawl-real-places.js')
  console.error('  YOUTUBE_API_KEY=... node scripts/crawl-youtube-captions.js')
  process.exit(1)
}

const examples = []

// --- Part 1: template captions from real place names ---
if (realPlaces) {
  const templates = (place) => [
    `${place.name} ở ${place.cityName} ngon xuất sắc luôn, phải thử ngay!`,
    `Đi ${place.cityName} nhớ ghé ${place.name} nha mọi người ơi`,
    `${place.name} - quán này ở ${place.cityName} rất đáng thử`,
    `Review ${place.name} tại ${place.cityName} có đáng đi không mọi người?`,
    `Ăn gì ở ${place.cityName}? Mình gợi ý ${place.name} nè`,
  ]
  for (const place of realPlaces) {
    if (!place.name) continue
    for (const text of templates(place)) {
      const { tokens, tags } = tagCaption(text, [
        { text: place.name, label: 'BUSINESS' },
        { text: place.cityName, label: 'LOC' },
      ])
      examples.push({ tokens, ner_tags: tags, source: 'real-place-template', places: [place.name] })
    }
  }

  // Listicle captions: 2-3 real places from the same city in one caption.
  const byCity = {}
  for (const p of realPlaces) (byCity[p.cityName] ??= []).push(p)
  for (const [cityName, places] of Object.entries(byCity)) {
    if (places.length < 2) continue
    const chosen = shuffle(places).slice(0, Math.min(3, places.length))
    const names = chosen.map((p) => p.name)
    const text = `Top ${names.length} quán ăn ngon ở ${cityName} phải thử: ${names.join(', ')}`
    const { tokens, tags } = tagCaption(text, [
      { text: cityName, label: 'LOC' },
      ...names.map((n) => ({ text: n, label: 'BUSINESS' })),
    ])
    examples.push({ tokens, ner_tags: tags, source: 'real-place-listicle', places: names })
  }
  console.log(`Real-place templates: ${examples.length} examples from ${realPlaces.length} real places`)
}

// --- Part 2: real YouTube captions, auto-labeled by matching real places ---
if (realPlaces && youtubeCaptions) {
  const startCount = examples.length
  const placesByCity = {}
  for (const p of realPlaces) (placesByCity[p.cityName] ??= []).push(p)

  for (const cap of youtubeCaptions) {
    const text = cap.title || cap.description
    if (!text) continue
    const candidates = [...(placesByCity[cap.cityName] ?? [])]
    if (cap.placeName && !candidates.some((p) => p.name === cap.placeName)) candidates.push({ name: cap.placeName })
    const matched = candidates.filter((p) => p.name && text.toLowerCase().includes(p.name.toLowerCase()))
    const entities = matched.map((p) => ({ text: p.name, label: 'BUSINESS' }))
    if (text.toLowerCase().includes(cap.cityName.toLowerCase())) entities.push({ text: cap.cityName, label: 'LOC' })
    if (!entities.length) continue // no real entity found in this caption — no training signal, skip
    const { tokens, tags } = tagCaption(text, entities)
    examples.push({ tokens, ner_tags: tags, source: 'youtube-real', places: matched.map((p) => p.name), venue: cap.placeName ?? matched[0]?.name })
  }
  console.log(`Real YouTube captions matched & labeled: ${examples.length - startCount} of ${youtubeCaptions.length} crawled`)
} else if (youtubeCaptions) {
  console.warn('Have YouTube captions but no real-places.json to match against — skipping (can\'t auto-label without a known-entity list).')
}

if (!examples.length) {
  console.error('No labeled examples produced — check that your crawled files have data.')
  process.exit(1)
}

// ---------- Split by venue, test on real captions only ----------
//
// A random split scored the model on names it had already memorised: every
// place yields five template sentences, so the same business sat in train and
// in test, and most of test was template text far easier than a real caption.
// The F1 that produced said nothing about recognising a place it has not seen.
//
// Instead:
// - Venues are assigned to one side by a stable hash of the name.
// - test.jsonl holds only REAL YouTube captions, about venues whose name never
//   appears anywhere in train or val. This is the number to report.
// - Template sentences about those held-out venues are dropped rather than
//   trained on, which is what would leak the names.
// - test_template.jsonl keeps a template-only test (unseen venues too), for
//   comparing performance on clean vs. real text.

function bucket(name) {
  let h = 2166136261
  for (const ch of name.toLowerCase()) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0
  return (h % 1000) / 1000
}

const captionExamples = examples.filter((e) => e.source === 'youtube-real')
const templateExamples = examples.filter((e) => e.source !== 'youtube-real')

// Venues whose real videos form the test set.
const captionVenues = [...new Set(captionExamples.map((e) => e.venue).filter(Boolean))]
const heldOut = new Set(captionVenues.filter((venue) => bucket(venue) < 0.4))
const touchesHeldOut = (e) => (e.places ?? []).some((name) => heldOut.has(name))

// A test caption can name a second venue besides the one it is about. That
// venue must be held out too, or its template sentences train the model on a
// name the test then asks about — which in turn can pull more captions into
// test. Grow the set until nothing changes.
for (let changed = true; changed;) {
  changed = false
  for (const e of captionExamples) {
    if (!touchesHeldOut(e) && !heldOut.has(e.venue)) continue
    for (const name of [e.venue, ...(e.places ?? [])]) {
      if (name && !heldOut.has(name)) {
        heldOut.add(name)
        changed = true
      }
    }
  }
}

const train = []
const val = []
const test = []
const testTemplate = []

for (const e of captionExamples) {
  if (heldOut.has(e.venue) || touchesHeldOut(e)) test.push(e)
  else if (bucket(e.venue ?? '') < 0.55) val.push(e)
  else train.push(e)
}
for (const e of templateExamples) {
  if (touchesHeldOut(e)) continue // would teach the held-out names
  const b = bucket((e.places ?? []).join('|'))
  if (b < 0.8) train.push(e)
  else if (b < 0.9) val.push(e)
  else testTemplate.push(e)
}

// Guard against the one thing this split exists to prevent.
const trainNames = new Set(train.flatMap((e) => e.places ?? []))
const leaked = test.filter((e) => (e.places ?? []).some((name) => trainNames.has(name)))
if (leaked.length) {
  console.error(`Leak: ${leaked.length} test captions name a venue seen in training.`)
  process.exit(1)
}

const shuffled = shuffle(examples)
const splits = {
  'train.jsonl': shuffle(train),
  'val.jsonl': shuffle(val),
  'test.jsonl': shuffle(test),
  'test_template.jsonl': shuffle(testTemplate),
}
for (const [file, rows] of Object.entries(splits)) {
  const body = rows.map((r) => JSON.stringify({ tokens: r.tokens, ner_tags: r.ner_tags, source: r.source })).join('\n') + '\n'
  writeFileSync(new URL(file, OUT_DIR), body, 'utf8')
}
writeFileSync(new URL('labels.json', OUT_DIR), JSON.stringify(LABELS, null, 2) + '\n', 'utf8')
console.log(`\nVenues held out for testing: ${heldOut.size} (their templates dropped: none of their names reach training)`)
console.log(`Total written: ${Object.values(splits).reduce((n, rows) => n + rows.length, 0)} of ${shuffled.length} examples (this overwrites ml/ner-dataset/)`)
for (const [file, rows] of Object.entries(splits)) console.log(`  ${file}: ${rows.length} examples`)
