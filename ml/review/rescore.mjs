// Re-scores a trained model's saved predictions against reviewed (or
// suggested) labels, entity by entity like seqeval: a predicted entity counts
// only when its type and exact token span match.
//
// The run's <split>-errors.json holds predictions only for captions it got
// wrong; every other caption was predicted exactly as its old reference.
//
// Usage: node ml/review/rescore.mjs <model-dir> <split> [--labels suggested|gold]

import process from 'node:process'
import { readFileSync, existsSync } from 'node:fs'

const [modelDir, split = 'test'] = process.argv.slice(2)
const which = process.argv.includes('gold') ? 'gold' : 'suggested'
if (!modelDir) { console.error('usage: node ml/review/rescore.mjs <model-dir> <split> [--labels suggested|gold]'); process.exit(1) }

export function entities(tags) {
  const out = []
  let cur = null
  tags.forEach((tag, i) => {
    const [bio, type] = tag.split('-')
    if (bio === 'B' || (bio === 'I' && (!cur || cur.type !== type))) {
      if (cur) out.push(cur)
      cur = { type, start: i, end: i }
    } else if (bio === 'I' && cur) {
      cur.end = i
    } else {
      if (cur) out.push(cur)
      cur = null
    }
  })
  if (cur) out.push(cur)
  return out.map((e) => `${e.type}:${e.start}-${e.end}`)
}

export function score(pairs) {
  const by = {}
  const add = (type, key, n) => { (by[type] ??= { tp: 0, pred: 0, gold: 0 })[key] += n }
  for (const { gold, pred } of pairs) {
    const g = entities(gold), p = entities(pred)
    for (const e of p) add(e.split(':')[0], 'pred', 1)
    for (const e of g) add(e.split(':')[0], 'gold', 1)
    for (const e of p) if (g.includes(e)) add(e.split(':')[0], 'tp', 1)
  }
  const f = ({ tp, pred, gold }) => {
    const precision = pred ? tp / pred : 0, recall = gold ? tp / gold : 0
    return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, support: gold }
  }
  const total = Object.values(by).reduce((a, b) => ({ tp: a.tp + b.tp, pred: a.pred + b.pred, gold: a.gold + b.gold }), { tp: 0, pred: 0, gold: 0 })
  return { ...Object.fromEntries(Object.entries(by).map(([k, v]) => [k, f(v)])), micro: f(total) }
}

const root = new URL('../../', import.meta.url)
// Gold labels live in the export of review.html; suggestions in the review set.
const review = JSON.parse(readFileSync(new URL(`ml/review/${split}-${which === 'gold' ? 'reviewed' : 'review'}.json`, root), 'utf8'))
const errorsFile = new URL(`${modelDir.replace(/\\/g, '/').replace(/\/?$/, '/')}${split}-errors.json`, root)
if (!existsSync(errorsFile)) { console.error(`missing ${errorsFile.pathname}`); process.exit(1) }
const errors = new Map(JSON.parse(readFileSync(errorsFile, 'utf8')).map((e) => [e.row, e.prediction]))

const labelOf = (it) => (which === 'gold' ? it.gold_tags : it.suggested_tags)
const usable = review.items.filter((it) => (which === 'gold' ? it.status === 'approved' : it.flag !== 'X') && labelOf(it))
// Predictions were made on the old (v1) tokens; lay them over the review's tokens.
const project = (it, tags) => (it.v1_map ? it.v1_map.map(([i, first]) => (first || tags[i] === 'O' ? tags[i] : 'I-' + tags[i].slice(2))) : tags)
const predOf = (it) => (errors.has(it.row) ? project(it, errors.get(it.row)) : it.auto_tags)
const pairs = usable.map((it) => ({ gold: labelOf(it), pred: predOf(it), auto: it.auto_tags }))
const pct = (x) => `${(x * 100).toFixed(1)}%`
const show = (name, s) => console.log(`${name.padEnd(34)} BUSINESS F1 ${pct(s.BUSINESS?.f1 ?? 0)} (n=${s.BUSINESS?.support ?? 0}) · LOC F1 ${pct(s.LOC?.f1 ?? 0)} (n=${s.LOC?.support ?? 0}) · micro F1 ${pct(s.micro.f1)}`)
console.log(`${split}: ${usable.length} captions scored against ${which} labels (${review.items.length - usable.length} excluded)`)
show('model vs ' + which + ' labels', score(pairs))
show('old automatic labels vs ' + which, score(pairs.map((p) => ({ gold: p.gold, pred: p.auto }))))
const negatives = usable.filter((it) => !labelOf(it).some((t) => t.endsWith('BUSINESS')))
const falseAlarms = negatives.filter((it) => predOf(it).some((t) => t.endsWith('BUSINESS'))).length
console.log(`captions with no business: ${negatives.length}; model tagged a business in ${falseAlarms} (${negatives.length ? pct(falseAlarms / negatives.length) : '—'})`)

// Step 5: what kind of mistakes. An entity is missed, invented, cut at the
// wrong place (overlaps a gold one of the same type), or given the wrong type.
const spanOf = (e) => { const [type, range] = e.split(':'); const [a, b] = range.split('-').map(Number); return { type, a, b } }
const overlap = (x, y) => x.a <= y.b && y.a <= x.b
const kinds = { missed: [], invented: [], boundary: [], wrong_type: [] }
usable.forEach((it) => {
  const gold = entities(labelOf(it)).map(spanOf), pred = entities(predOf(it)).map(spanOf)
  const text = (e) => it.tokens.slice(e.a, e.b + 1).join(' ')
  const same = (x, y) => x.type === y.type && x.a === y.a && x.b === y.b
  for (const g of gold) {
    if (pred.some((p) => same(p, g))) continue
    const near = pred.find((p) => overlap(p, g))
    if (!near) kinds.missed.push(`${it.id} ${g.type} "${text(g)}"`)
    else if (near.type !== g.type) kinds.wrong_type.push(`${it.id} "${text(g)}" ${g.type}→${near.type}`)
    else kinds.boundary.push(`${it.id} ${g.type} "${text(g)}" → "${text(near)}"`)
  }
  for (const p of pred) if (!gold.some((g) => overlap(g, p))) kinds.invented.push(`${it.id} ${p.type} "${text(p)}"`)
})
console.log('\nerrors by kind:')
for (const [kind, list] of Object.entries(kinds)) {
  console.log(`  ${kind.padEnd(10)} ${String(list.length).padStart(3)}  e.g. ${list.slice(0, 4).join(' · ')}`)
}
