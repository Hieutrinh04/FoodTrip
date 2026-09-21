// Generates a synthetic Vietnamese NER training set (BUSINESS / LOC entities)
// from the app's own curated place data, to bootstrap fine-tuning a local
// model that replaces the detect-place edge function's Anthropic call.
//
// Real TikTok/YouTube captions aren't available in bulk yet (video_reviews
// only has a handful of rows), so this generates varied caption-style
// sentences from src/data/destinations.js instead — same place names,
// addresses and descriptions the app already trusts, just recombined into
// caption templates. Swap in real labeled captions later and concatenate.
//
// Usage: node scripts/generate-ner-dataset.js
// Output: ml/ner-dataset/{train,val,test}.jsonl + labels.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { PLACES, CITIES, CATEGORY_LABEL } from '../src/data/destinations.js'

const OUT_DIR = new URL('../ml/ner-dataset/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })

const LABELS = ['O', 'B-BUSINESS', 'I-BUSINESS', 'B-LOC', 'I-LOC']

// Small deterministic PRNG so the dataset is reproducible across runs.
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

const cityById = Object.fromEntries(CITIES.map((c) => [c.id, c]))

// Vietnamese-aware-ish tokenizer: keeps words as-is, splits off punctuation
// as separate tokens. Word-level (not syllable-level) — PhoBERT expects
// word-segmented input, so the Colab notebook re-segments with underthesea/
// VnCoreNLP before tokenizing; this script only needs consistent word spans.
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

/** Splits a caption template into tokens, tagging the given entity spans (by substring) as BIO. */
function tagCaption(text, entities) {
  // entities: [{ text: 'Phở Thìn Bờ Hồ', label: 'BUSINESS' }, ...]
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
        break // tag only the first occurrence to avoid double-tagging repeats
      }
    }
  }
  return { tokens, tags }
}

function districtOf(place) {
  const parts = place.address.vi.split(',').map((s) => s.trim())
  return parts.length >= 3 ? parts[1] : null
}

function snippet(desc, maxWords = 10) {
  const words = desc.split(/\s+/)
  return words.slice(0, Math.min(maxWords, words.length)).join(' ')
}

function singlePlaceCaptions(place) {
  const city = cityById[place.city]
  const cityName = city.name.vi
  const district = districtOf(place)
  const catLabel = CATEGORY_LABEL[place.category].vi.toLowerCase()
  const desc = snippet(place.shortDesc.vi)
  const name = place.name.vi

  const locSpan = district ? `${district}, ${cityName}` : cityName
  const templates = [
    {
      text: `${name} ở ${cityName} ngon xuất sắc luôn, phải thử ngay!`,
      entities: [{ text: name, label: 'BUSINESS' }, { text: cityName, label: 'LOC' }],
    },
    {
      text: `Đi ${cityName} nhớ ghé ${name} nha mọi người ơi`,
      entities: [{ text: cityName, label: 'LOC' }, { text: name, label: 'BUSINESS' }],
    },
    {
      text: `Top quán ${catLabel} nổi tiếng ${cityName}: ${name}`,
      entities: [{ text: cityName, label: 'LOC' }, { text: name, label: 'BUSINESS' }],
    },
    {
      text: `${name} - ${desc}`,
      entities: [{ text: name, label: 'BUSINESS' }],
    },
    {
      text: `Quán ${name} nằm ở ${locSpan}, đông khách lắm`,
      entities: [{ text: name, label: 'BUSINESS' }, { text: locSpan, label: 'LOC' }],
    },
    {
      text: `${desc}. Địa chỉ: ${name}, ${cityName}`,
      entities: [{ text: name, label: 'BUSINESS' }, { text: cityName, label: 'LOC' }],
    },
    {
      text: `Review ${name} tại ${cityName} có đáng đi không mọi người?`,
      entities: [{ text: name, label: 'BUSINESS' }, { text: cityName, label: 'LOC' }],
    },
    {
      text: `Ăn gì ở ${cityName}? Mình gợi ý ${name} nè`,
      entities: [{ text: cityName, label: 'LOC' }, { text: name, label: 'BUSINESS' }],
    },
  ]
  return templates
}

function listicleCaptions(placesInCity, cityName) {
  if (placesInCity.length < 2) return []
  const count = Math.min(3, placesInCity.length)
  const chosen = shuffle(placesInCity).slice(0, count)
  const names = chosen.map((p) => p.name.vi)
  const text = `Top ${count} quán ăn ngon ở ${cityName} phải thử: ${names.join(', ')}`
  const entities = [{ text: cityName, label: 'LOC' }, ...names.map((n) => ({ text: n, label: 'BUSINESS' }))]
  return [{ text, entities }]
}

const examples = []

for (const place of PLACES) {
  for (const tpl of singlePlaceCaptions(place)) {
    const { tokens, tags } = tagCaption(tpl.text, tpl.entities)
    examples.push({ tokens, ner_tags: tags, source: place.id })
  }
}

for (const city of CITIES) {
  const placesInCity = PLACES.filter((p) => p.city === city.id)
  for (const tpl of listicleCaptions(placesInCity, city.name.vi)) {
    const { tokens, tags } = tagCaption(tpl.text, tpl.entities)
    examples.push({ tokens, ner_tags: tags, source: `${city.id}-listicle` })
  }
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

console.log(`Generated ${shuffled.length} examples from ${PLACES.length} places / ${CITIES.length} cities.`)
for (const [file, rows] of Object.entries(splits)) console.log(`  ${file}: ${rows.length} examples`)
console.log(`Written to ${OUT_DIR.pathname}`)
