// How the known-venue list (supabase/functions/_shared/knownPlaces.js) does on the
// labelled captions, using the seed list (ml/real-places.json) — no credits.
// Usage: node scripts/eval-known-places.js

import { readFileSync, existsSync } from 'node:fs'
import { coreName, sameVenue } from '../supabase/functions/_shared/placeNames.js'
import { matchKnown } from '../supabase/functions/_shared/knownPlaces.js'

const places = JSON.parse(readFileSync('ml/real-places.json', 'utf8'))
  .filter((p) => ['food', 'cafe'].includes(p.category))
  .map((p) => ({ place_id: p.id, name: p.name, core: coreName(p.name), city: p.cityName, confirmations: 0 }))
const spans = (tokens, tags) => {
  const out = []
  tags.forEach((t, i) => { if (t === 'B-BUSINESS') out.push([tokens[i]]); else if (t === 'I-BUSINESS' && out.length) out.at(-1).push(tokens[i]) })
  return out.map((p) => p.join(' '))
}
let named = 0, recognised = 0, none = 0, falseHits = 0, wrongHits = 0
const examples = []
for (const set of ['test', 'val', 'new', 'train']) {
  const file = existsSync(`ml/review/${set}-reviewed.json`) ? `ml/review/${set}-reviewed.json` : `ml/review/${set}-review.json`
  for (const it of JSON.parse(readFileSync(file, 'utf8')).items) {
    if (it.flag === 'X' || it.status === 'removed') continue
    const text = it.tokens.join(' ')
    const gold = spans(it.tokens, it.gold_tags ?? it.suggested_tags)
    const hits = matchKnown(text, places)
    if (gold.length) {
      named++
      if (hits.some((h) => gold.some((g) => sameVenue(g, h.place.name)))) recognised++
      else if (hits.length) { wrongHits++; examples.push(`  wrong  ${text.slice(0, 80)} ⟶ ${hits.map((h) => h.place.name).join(' | ')}`) }
    } else {
      none++
      if (hits.length) { falseHits++; examples.push(`  false  ${text.slice(0, 80)} ⟶ ${hits.map((h) => h.place.name).join(' | ')}`) }
    }
  }
}
const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`
console.log(`${places.length} known venues · captions naming a venue: recognised ${recognised}/${named} (${pct(recognised, named)}), wrong venue ${wrongHits} · captions naming none: false match ${falseHits}/${none} (${pct(falseHits, none)})`)
console.log(examples.slice(0, 15).join('\n'))
