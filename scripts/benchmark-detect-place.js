// Step 7 of ml/training/CRITERIA.md — the model against what the site does
// today. For each caption of the test set:
//
//   site   the deployed detect-place Edge Function (search + matching): is
//          the right venue among its first 3 suggestions? For a caption that
//          names no venue: does it still suggest one?
//   model  the NER model's predictions (predict_ner.py --file … --out …):
//          did it find the venue's name? For a caption naming none: did it
//          invent one?
//
// Venue names are compared accent- and "quán / nhà hàng …"-insensitively, and
// one name may contain the other ("Quán Bánh xèo 7 Tới" ≈ "Bánh Xèo 7 Tới").
// detect-place answers are cached in ml/benchmarks/detect-place-cache.json,
// so a rerun spends no Serper credits (each new caption costs about 2–3).
//
// Usage: node scripts/benchmark-detect-place.js [--data ml/datasets/v3/test.jsonl]
//          [--predictions ml/benchmarks/model-test.jsonl | --errors <run>/test-errors.json]
//          [--limit 20] [--model-only]
//
// --errors uses the test-errors.json a Colab run writes: it lists the model's
// tags for every caption it got wrong; every other caption it tagged exactly
// as the reference. No model has to be loaded on this machine.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { canonical, sameVenue } from './lib/nerDataset.js'

const opt = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
const dataFile = opt('data', existsSync('ml/datasets/v3/test.jsonl') ? 'ml/datasets/v3/test.jsonl' : 'ml/datasets/v3-silver/test.jsonl')
const predictionsFile = opt('predictions', null)
const errorsFile = opt('errors', null)
const limit = Number(opt('limit', Infinity))
const modelOnly = process.argv.includes('--model-only')

const env = (name) => readFileSync('.env.local', 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1].trim()
const spans = (tokens, tags, label) => {
  const out = []
  tags.forEach((t, i) => { if (t === `B-${label}`) out.push([tokens[i]]); else if (t === `I-${label}` && out.length) out.at(-1).push(tokens[i]) })
  return out.map((p) => p.join(' '))
}

const rows = readFileSync(dataFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
const cases = rows.map((r) => ({ text: r.tokens.join(' '), gold: spans(r.tokens, r.ner_tags, 'BUSINESS') }))
// Positives and negatives interleaved, so a small --limit still sees both kinds.
const pos = cases.filter((c) => c.gold.length), neg = cases.filter((c) => !c.gold.length)
const ordered = []
for (let i = 0; i < Math.max(pos.length, neg.length); i++) { if (pos[i]) ordered.push(pos[i]); if (neg[i]) ordered.push(neg[i]) }
const chosen = ordered.slice(0, limit)

mkdirSync('ml/benchmarks', { recursive: true })
const cacheFile = 'ml/benchmarks/detect-place-cache.json'
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}
let spent = 0
if (!modelOnly) {
  const url = env('VITE_SUPABASE_URL'), anon = env('VITE_SUPABASE_ANON_KEY')
  for (const c of chosen) {
    const key = canonical(c.text)
    if (cache[key]) continue
    const started = Date.now()
    const res = await fetch(`${url}/functions/v1/detect-place`, {
      method: 'POST', headers: { authorization: `Bearer ${anon}`, apikey: anon, 'content-type': 'application/json' },
      body: JSON.stringify({ caption: c.text }), signal: AbortSignal.timeout(60000),
    })
    const data = await res.json().catch(() => ({}))
    cache[key] = { status: res.status, ms: Date.now() - started, names: (data.places ?? []).map((p) => p.name), source: data.source ?? null }
    spent++
    writeFileSync(cacheFile, JSON.stringify(cache, null, 1))
  }
}

const predictions = new Map()
if (errorsFile) {
  const wrong = new Map(JSON.parse(readFileSync(errorsFile, 'utf8')).map((e) => [e.row, e]))
  rows.forEach((r, i) => {
    const e = wrong.get(i)
    if (e && e.tokens.join(' ') !== r.tokens.join(' ')) throw new Error(`${errorsFile} row ${i} is not the same caption as ${dataFile} — use the run's own data`)
    predictions.set(canonical(r.tokens.join(' ')), spans(r.tokens, e ? e.prediction : r.ner_tags, 'BUSINESS'))
  })
}
if (predictionsFile) {
  for (const line of readFileSync(predictionsFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const p = JSON.parse(line)
    predictions.set(canonical(p.text), (p.entities ?? []).filter((e) => e.label === 'BUSINESS').map((e) => e.text))
  }
}

const result = { site: { positives: 0, hit1: 0, hit3: 0, negatives: 0, suggested_on_negative: 0, ms: [] }, model: { positives: 0, found: 0, negatives: 0, invented: 0, missing: 0 } }
const examples = []
for (const c of chosen) {
  const site = cache[canonical(c.text)]
  if (site) {
    if (c.gold.length) {
      result.site.positives++
      const hitAt = site.names.findIndex((n) => c.gold.some((g) => sameVenue(g, n)))
      if (hitAt === 0) result.site.hit1++
      if (hitAt >= 0 && hitAt < 3) result.site.hit3++
    } else {
      result.site.negatives++
      if (site.names.length) result.site.suggested_on_negative++
    }
    result.site.ms.push(site.ms)
  }
  const model = predictions.get(canonical(c.text))
  if (model === undefined) { if (predictionsFile) result.model.missing++ } else if (c.gold.length) {
    result.model.positives++
    if (model.some((m) => c.gold.some((g) => sameVenue(g, m)))) result.model.found++
  } else {
    result.model.negatives++
    if (model.length) result.model.invented++
  }
  if (examples.length < 12) examples.push({ text: c.text.slice(0, 90), gold: c.gold, site: site?.names.slice(0, 3), model })
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
const ms = [...result.site.ms].sort((a, b) => a - b)
console.log(`${dataFile}: ${chosen.length} captions (${chosen.filter((c) => c.gold.length).length} name a venue) — ${spent} new detect-place calls (≈${spent * 3} Serper credits at most)`)
console.log(`site  (detect-place): venue in top 1 ${pct(result.site.hit1, result.site.positives)}, top 3 ${pct(result.site.hit3, result.site.positives)} of ${result.site.positives}; suggests a venue for ${pct(result.site.suggested_on_negative, result.site.negatives)} of ${result.site.negatives} captions naming none; median ${ms[Math.floor(ms.length / 2)] ?? '—'} ms`)
if (predictionsFile || errorsFile) console.log(`model (NER):         finds the venue ${pct(result.model.found, result.model.positives)} of ${result.model.positives}; invents one for ${pct(result.model.invented, result.model.negatives)} of ${result.model.negatives} captions naming none${result.model.missing ? `; ${result.model.missing} captions have no prediction` : ''}`)
const report = `ml/benchmarks/report-${new Date().toISOString().slice(0, 10)}.json`
writeFileSync(report, JSON.stringify({ data: dataFile, predictions: predictionsFile ?? errorsFile, captions: chosen.length, ...result, site: { ...result.site, ms: undefined, median_ms: ms[Math.floor(ms.length / 2)] ?? null }, examples }, null, 2))
console.log(`report: ${report}`)
