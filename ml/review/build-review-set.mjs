// Builds a review set: each real caption with the old automatic labels and
// the suggested labels (from ml/review/suggestions/<split>.json), ready for
// a person to check in review.html. Suggestions are not gold labels.
//
// Usage: node ml/review/build-review-set.mjs <split> [prefix] [candidates.json]
//   split   test | val | train   (reads ml/colab-package/data/<split>.jsonl)
//           new                  (reads newly crawled captions: the given
//                                 file, else the latest ml/candidates/*.json)
//   prefix  id prefix used in the suggestions file (default: first letter)
// Output: ml/review/<split>-review.json; unmatched suggestion spans are listed.

import process from 'node:process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tokenizeCaption, TOKENIZER_VERSION } from '../../scripts/lib/captionTokens.js'

const split = process.argv[2]
const prefix = process.argv[3] ?? split?.[0]
if (!split) { console.error('usage: node ml/review/build-review-set.mjs <split> [prefix]'); process.exit(1) }

const root = new URL('../', import.meta.url)
const norm = (s) => s.normalize('NFC').toLowerCase()
// Spans are split exactly like captions, so "TP.HCM" or "Nhan's Kitchen" line up.
const tokenize = (text) => tokenizeCaption(text)

/** BIO tags for `tokens` from labelled surface spans; every non-overlapping mention is tagged. */
export function tagSpans(tokens, spans) {
  const tags = tokens.map(() => 'O')
  const missing = []
  const lower = tokens.map(norm)
  // Longest spans first, so "Chợ Phú Quốc" wins over "Phú Quốc".
  // The same span written in another case is one span: every mention is tagged anyway.
  const unique = [...new Map(spans.map((s) => [`${s.label}:${norm(s.text)}`, s])).values()]
  const ordered = [...unique].sort((a, b) => tokenize(b.text).length - tokenize(a.text).length)
  for (const { text, label } of ordered) {
    const want = tokenize(text).map(norm)
    let found = false
    for (let i = 0; i + want.length <= tokens.length; i++) {
      if (!want.every((w, j) => lower[i + j] === w && tags[i + j] === 'O')) continue
      tags[i] = `B-${label}`
      for (let j = 1; j < want.length; j++) tags[i + j] = `I-${label}`
      found = true
    }
    if (!found) missing.push(`${label}:"${text}"`)
  }
  return { tags, missing }
}

let real, crawlFile = null
if (split === 'new') {
  // Freshly crawled captions: no old tokens or labels; split with tokenizer v2.
  crawlFile = process.argv[4] ?? `ml/candidates/${readdirSync(new URL('candidates/', root)).filter((f) => f.endsWith('.json')).sort().at(-1)}`
  const crawl = JSON.parse(readFileSync(new URL(`../${crawlFile}`, root), 'utf8'))
  real = crawl.items.map((c, index) => {
    const tokens = tokenizeCaption(c.text)
    return { index, row: { tokens, ner_tags: tokens.map(() => 'O'), source: c.source, video_ids: c.url ? [c.url] : [], group_id: c.venue ?? null, fresh: true } }
  })
} else {
  const rows = readFileSync(new URL(`colab-package/data/${split}.jsonl`, root), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  real = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.source === 'youtube-real')
}
const suggestions = JSON.parse(readFileSync(new URL(`review/suggestions/${split}.json`, root), 'utf8'))

const items = []
let missingTotal = 0
for (const [n, { row, index }] of real.entries()) {
  const id = `${prefix}${n}`
  const s = suggestions[id] ?? suggestions._default
  if (!s) { console.warn(`no suggestion for ${id}`); continue }
  const spans = [...(s.B ?? []).map((text) => ({ text, label: 'BUSINESS' })), ...(s.L ?? []).map((text) => ({ text, label: 'LOC' }))]
  // Re-split each old token with tokenizer v2, remembering where each piece came from, so
  // old labels and a model's old predictions can be laid over the new tokens.
  const tokens = [], v1Map = []
  if (row.fresh) row.tokens.forEach((token, i) => { tokens.push(token); v1Map.push([i, true]) })
  else row.tokens.forEach((token, i) => tokenizeCaption(token).forEach((piece, j) => { tokens.push(piece); v1Map.push([i, j === 0]) }))
  const project = (tags) => v1Map.map(([i, first]) => (first || tags[i] === 'O' ? tags[i] : 'I-' + tags[i].slice(2)))
  const { tags, missing } = tagSpans(tokens, spans)
  if (missing.length) { missingTotal += missing.length; console.warn(`${id}: not found ${missing.join(', ')}`) }
  items.push({
    id, split, row: index, tokenizer: TOKENIZER_VERSION, tokens, v1_map: v1Map, auto_tags: project(row.ner_tags), suggested_tags: tags,
    flag: s.flag ?? null, note: s.note ?? '', source: row.source, video_ids: row.video_ids ?? [], group_id: row.group_id ?? null,
  })
}

const changed = items.filter((it) => it.auto_tags.join() !== it.suggested_tags.join()).length
writeFileSync(new URL(`review/${split}-review.json`, root), JSON.stringify({ split, created: new Date().toISOString(), guide: 'ml/training/ANNOTATION-GUIDE.md', source: crawlFile, items }, null, 1))
console.log(`${split}: ${items.length} captions, ${changed} differ from the automatic labels, ${items.filter((i) => i.flag === 'N').length} need a closer look, ${items.filter((i) => i.flag === 'X').length} proposed for removal, ${missingTotal} unmatched spans`)
