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
      examples.push({ tokens, ner_tags: tags, source: 'real-place-template' })
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
    examples.push({ tokens, ner_tags: tags, source: 'real-place-listicle' })
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
    const candidates = placesByCity[cap.cityName] ?? []
    const matched = candidates.filter((p) => p.name && text.toLowerCase().includes(p.name.toLowerCase()))
    const entities = matched.map((p) => ({ text: p.name, label: 'BUSINESS' }))
    if (text.toLowerCase().includes(cap.cityName.toLowerCase())) entities.push({ text: cap.cityName, label: 'LOC' })
    if (!entities.length) continue // no real entity found in this caption — no training signal, skip
    const { tokens, tags } = tagCaption(text, entities)
    examples.push({ tokens, ner_tags: tags, source: 'youtube-real' })
  }
  console.log(`Real YouTube captions matched & labeled: ${examples.length - startCount} of ${youtubeCaptions.length} crawled`)
} else if (youtubeCaptions) {
  console.warn('Have YouTube captions but no real-places.json to match against — skipping (can\'t auto-label without a known-entity list).')
}

if (!examples.length) {
  console.error('No labeled examples produced — check that your crawled files have data.')
  process.exit(1)
}

const shuffled = shuffle(examples)
const nTrain = Math.floor(shuffled.length * 0.8)
const nVal = Math.floor(shuffled.length * 0.1)
const splits = {
  'train.jsonl': shuffled.slice(0, nTrain),
  'val.jsonl': shuffled.slice(nTrain, nTrain + nVal),
  'test.jsonl': shuffled.slice(nTrain + nVal),
}
for (const [file, rows] of Object.entries(splits)) {
  const body = rows.map((r) => JSON.stringify({ tokens: r.tokens, ner_tags: r.ner_tags })).join('\n') + '\n'
  writeFileSync(new URL(file, OUT_DIR), body, 'utf8')
}
writeFileSync(new URL('labels.json', OUT_DIR), JSON.stringify(LABELS, null, 2) + '\n', 'utf8')

console.log(`\nTotal: ${shuffled.length} examples (this overwrites ml/ner-dataset/ from generate-ner-dataset.js)`)
for (const [file, rows] of Object.entries(splits)) console.log(`  ${file}: ${rows.length} examples`)
