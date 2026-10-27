// Builds the assistant's training data (intent + BIO slots per word) from
// ml/assistant/templates.js, plus the hand-written test set
// ml/assistant/real-test.json, into ml/assistant/data/*.jsonl.
//
//   node scripts/generate-assistant-dataset.js
//
// Reproducible (seeded). A template belongs to one split by its position, so
// validation and test hold phrasings the model never trained on; test also uses
// destinations and venues kept out of training. Words are split with the same
// tokenizer the model's Python side uses (scripts/lib/captionTokens.js ↔
// ml/training/ner_preprocessing.py tokenize_caption).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TEMPLATES, VALUES } from '../ml/assistant/templates.js'
import { tokenizeCaption } from './lib/captionTokens.js'
import { INTENT_IDS, SLOT_LABELS } from '../supabase/functions/_shared/assistant/intents.js'

const OUT = 'ml/assistant/data'
const PER_TEMPLATE = { plan_trip: 32, modify_plan: 26, find_food: 26 }
const DEFAULT_PER_TEMPLATE = 24

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const random = rng(20261021)
const pick = (list) => list[Math.floor(random() * list.length)]

export const stripAccents = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC')
// How people shorten words in chat. Only applied outside slot values.
const SHORTHAND = [[/\bkhông\b/g, 'ko'], [/\bđược\b/g, 'đc'], [/\bvới\b/g, 'vs'], [/\bbao nhiêu\b/g, 'bn'], [/\bmình\b/g, 'mk'], [/\bgì\b/g, 'j'], [/\bnhé\b/g, 'nha'], [/\bvậy\b/g, 'z']]
const ENDINGS = ['', '', '', '?', ' ạ', ' nhé', ' với', ' ad ơi', '!!']
// How people open a question in chat; never part of a slot.
const OPENINGS = ['', '', '', 'cho mình hỏi ', 'ad ơi ', 'cho em hỏi là ', 'bạn ơi ', 'hỏi chút, ', 'mình muốn biết ', 'shop ơi ', 'ơ ', 'cho hỏi ']

/** Template string → [{ text, slot? }] with each {SLOT} filled. */
function fill(template, split) {
  const parts = []
  let last = 0
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) parts.push({ text: template.slice(last, m.index) })
    const slot = m[1]
    const testPool = VALUES[`${slot}_TEST`]
    const pool = split === 'test' && testPool && random() < 0.5 ? testPool : VALUES[slot]
    parts.push({ text: pick(pool), slot })
    last = m.index + m[0].length
  }
  if (last < template.length) parts.push({ text: template.slice(last) })
  return parts
}

/** Spelling variants applied the same way to every part, so tags stay aligned. */
function vary(parts) {
  const noAccents = random() < 0.25
  const lower = random() < 0.35
  const shorthand = random() < 0.2
  const capital = !lower && random() < 0.4
  const out = parts.map((p) => {
    let text = p.text
    if (shorthand && !p.slot) for (const [re, short] of SHORTHAND) text = text.replace(re, short)
    if (lower) text = text.toLocaleLowerCase('vi')
    if (noAccents) text = stripAccents(text)
    return { ...p, text }
  })
  if (capital && out[0]) out[0] = { ...out[0], text: out[0].text.charAt(0).toLocaleUpperCase('vi') + out[0].text.slice(1) }
  const ending = pick(ENDINGS)
  if (ending) out.push({ text: noAccents ? stripAccents(ending) : ending })
  const opening = pick(OPENINGS)
  if (opening) out.unshift({ text: noAccents ? stripAccents(opening) : opening })
  return out
}

/** Words and BIO tags of the filled parts; null when the whole text splits differently. */
function tag(parts) {
  const tokens = [], tags = []
  for (const p of parts) {
    const words = tokenizeCaption(p.text)
    words.forEach((w, i) => { tokens.push(w); tags.push(p.slot ? `${i ? 'I' : 'B'}-${p.slot}` : 'O') })
  }
  const text = parts.map((p) => p.text).join('').replace(/\s+/g, ' ').trim()
  const whole = tokenizeCaption(text)
  return whole.length === tokens.length && whole.every((w, i) => w === tokens[i]) ? { text, tokens, tags } : null
}

/** A hand-labelled message { text, intent, slots: [[TYPE, "exact text"], …] } → tagged row. */
export function labelReal({ text, intent, slots = [] }) {
  const tokens = tokenizeCaption(text)
  const tags = tokens.map(() => 'O')
  for (const [type, value] of slots) {
    const words = tokenizeCaption(value)
    const at = tokens.findIndex((_, i) => words.every((w, k) => tokens[i + k] === w) && words.every((_, k) => tags[i + k] === 'O'))
    if (at < 0) throw new Error(`"${value}" (${type}) not found in "${text}"`)
    words.forEach((_, k) => { tags[at + k] = `${k ? 'I' : 'B'}-${type}` })
  }
  return { text, tokens, tags, intent }
}

function main() {
  const rows = { train: [], validation: [], test: [] }
  const seen = new Set()
  for (const [intent, templates] of Object.entries(TEMPLATES)) {
    if (!INTENT_IDS.includes(intent)) throw new Error(`Unknown intent ${intent}`)
    templates.forEach((template, i) => {
      const split = i % 7 === 5 ? 'validation' : i % 7 === 6 ? 'test' : 'train'
      const count = PER_TEMPLATE[intent] ?? DEFAULT_PER_TEMPLATE
      // Templates with no slot have few spellings; do not repeat them endlessly.
      const tries = /\{/.test(template) ? count : Math.min(count, 18)
      for (let n = 0; n < tries; n++) {
        const row = tag(vary(fill(template, split)))
        if (!row || seen.has(row.text)) continue
        seen.add(row.text)
        rows[split].push({ id: `${intent}-${i}-${n}`, ...row, intent, template: i, source: 'template' })
      }
    })
  }
  const real = JSON.parse(readFileSync('ml/assistant/real-test.json', 'utf8')).map((r, i) => ({ id: `real-${i}`, ...labelReal(r), source: 'hand' }))
  for (const r of real) if (!INTENT_IDS.includes(r.intent)) throw new Error(`Unknown intent ${r.intent} in real-test`)
  for (const row of [...Object.values(rows).flat(), ...real]) for (const t of row.tags) if (!SLOT_LABELS.includes(t)) throw new Error(`Bad tag ${t}`)

  mkdirSync(OUT, { recursive: true })
  const jsonl = (list) => list.map((r) => JSON.stringify(r)).join('\n') + '\n'
  for (const [split, list] of Object.entries(rows)) writeFileSync(`${OUT}/${split}.jsonl`, jsonl(list))
  writeFileSync(`${OUT}/real_test.jsonl`, jsonl(real))
  writeFileSync(`${OUT}/labels.json`, JSON.stringify({ intents: INTENT_IDS, slots: SLOT_LABELS }, null, 2) + '\n')

  const count = (list) => Object.entries(list.reduce((a, r) => ({ ...a, [r.intent]: (a[r.intent] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ')
  for (const [split, list] of Object.entries(rows)) console.log(`${split.padEnd(10)} ${String(list.length).padStart(5)} rows · ${count(list)}`)
  console.log(`real_test  ${String(real.length).padStart(5)} rows (hand-written) · ${count(real)}`)
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('generate-assistant-dataset.js')) main()
