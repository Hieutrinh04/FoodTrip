// How well the rule-based caption reader (supabase/functions/_shared/captionSignals.js)
// does on the labelled captions — no map search, no credits:
//   - does it tell captions that name a venue from those that name none?
//   - when one is named, is it among the names it extracts?
// Labels: reviewed (gold) when ml/review/<set>-reviewed.json exists, else suggested.
//
// Usage: node scripts/eval-caption-signals.js [--show 8]

import { readFileSync, existsSync } from 'node:fs'
import process from 'node:process'
import { analyzeCaption } from '../supabase/functions/_shared/captionSignals.js'
import { sameVenue } from '../supabase/functions/_shared/placeNames.js'

const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 8
const spans = (tokens, tags) => {
  const out = []
  tags.forEach((t, i) => { if (t === 'B-BUSINESS') out.push([tokens[i]]); else if (t === 'I-BUSINESS' && out.length) out.at(-1).push(tokens[i]) })
  return out.map((p) => p.join(' '))
}
const cases = []
for (const set of ['test', 'val', 'new', 'train']) {
  const gold = existsSync(`ml/review/${set}-reviewed.json`)
  const file = gold ? `ml/review/${set}-reviewed.json` : `ml/review/${set}-review.json`
  if (!existsSync(file)) continue
  for (const it of JSON.parse(readFileSync(file, 'utf8')).items) {
    if (gold ? it.status !== 'approved' : it.flag === 'X') continue
    cases.push({ set, text: it.tokens.join(' '), venues: spans(it.tokens, gold ? it.gold_tags : it.suggested_tags) })
  }
}

// Rules are tuned on train / val / new captions; test is reported on its own as the held-out score.
function evaluate(cases) {
let tp = 0, fp = 0, fn = 0, tn = 0, found = 0
const misses = [], alarms = [], wrong = []
for (const c of cases) {
  const r = analyzeCaption(c.text)
  const has = c.venues.length > 0
  if (has && r.hasVenue) tp++; else if (has) { fn++; misses.push(c) } else if (r.hasVenue) { fp++; alarms.push({ ...c, r }) } else tn++
  if (has) {
    const guesses = [...r.names, ...(r.pin ? [r.pin] : [])]
    if (guesses.some((g) => c.venues.some((v) => sameVenue(v, g)))) found++
    else if (r.hasVenue) wrong.push({ ...c, r })
  }
}
return { tp, fp, fn, tn, found, misses, alarms, wrong }
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—')
const report = (label, r) => console.log(`${label.padEnd(20)} ${r.tp + r.fn + r.fp + r.tn} captions · venue named → detected ${pct(r.tp, r.tp + r.fn)}, right name ${pct(r.found, r.tp + r.fn)} · none named → skipped ${pct(r.tn, r.tn + r.fp)} (${r.fp} wasted searches)`)
const tune = evaluate(cases.filter((c) => c.set !== 'test'))
const held = evaluate(cases.filter((c) => c.set === 'test'))
report('tuning (train/val/new)', tune)
report('held-out test', held)
const { misses, alarms, wrong } = tune
const cut = (s) => s.slice(0, 110)
console.log('\nmissed (venue named, no signal):'); misses.slice(0, show).forEach((c) => console.log(`  [${c.set}] ${cut(c.text)}  ⟶ gold: ${c.venues.join(' | ')}`))
console.log('\nfalse signal (no venue named):'); alarms.slice(0, show).forEach((c) => console.log(`  [${c.set}] ${cut(c.text)}  ⟶ ${[...c.r.names, c.r.pin, c.r.address].filter(Boolean).join(' | ')}`))
console.log('\nwrong name (signal, but not the venue):'); wrong.slice(0, show).forEach((c) => console.log(`  [${c.set}] ${cut(c.text)}  ⟶ got ${[...c.r.names, c.r.pin].filter(Boolean).join(' | ')} / gold ${c.venues.join(' | ')}`))
