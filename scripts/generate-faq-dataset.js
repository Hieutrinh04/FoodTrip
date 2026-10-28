// The retriever's data (ml/assistant/train_retriever.py) from the FAQ base,
// and the word-matching baseline it has to beat.
//
//   node scripts/generate-faq-dataset.js
//
// faq_entries.jsonl  one row per answer: { id, intent, text } — what a question is matched against
// faq_train.jsonl    { question, id } — each entry's ways of asking but the last, with chat spellings
// faq_validation.jsonl { question, id } — each entry's last way of asking
// faq_test.jsonl     { question, id } — each entry's held-out phrasing, and the hand-written
//                    questions in ml/assistant/real-test.json that carry an `faq` id
// faq_baseline.json  top-1 / top-3 of faqRetrieve (words) on faq_test

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { FAQ, faqRetrieve } from '../supabase/functions/_shared/assistant/faq.js'
import { INTENT_IDS } from '../supabase/functions/_shared/assistant/intents.js'

const OUT = 'ml/assistant/data'
const strip = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC')
const OPENINGS = ['cho mình hỏi ', 'ad ơi ', 'bạn ơi ', 'cho em hỏi là ', 'hỏi chút, ']

const ids = new Set()
for (const e of FAQ) {
  if (ids.has(e.id)) throw new Error(`Duplicate FAQ id ${e.id}`)
  ids.add(e.id)
  if (!INTENT_IDS.includes(e.intent)) throw new Error(`${e.id}: unknown intent ${e.intent}`)
  if (e.q.length < 2 || !e.test || !e.a?.vi || !e.a?.en) throw new Error(`${e.id}: needs ≥2 questions, a test question and both answers`)
}

// Each entry's last way of asking is kept for validation (the retriever's "answer outright"
// threshold is chosen there, never on test); the others train, with chat spellings.
const train = FAQ.flatMap((e) => e.q.slice(0, -1).flatMap((q, i) => [
  { question: q, id: e.id },
  { question: strip(q), id: e.id },
  { question: OPENINGS[i % OPENINGS.length] + q + (i % 2 ? '?' : ''), id: e.id },
]))
const validation = FAQ.map((e) => ({ question: e.q.at(-1), id: e.id }))
const hand = JSON.parse(readFileSync('ml/assistant/real-test.json', 'utf8')).filter((r) => r.faq).map((r) => ({ question: r.text, id: r.faq, source: 'hand' }))
for (const h of hand) if (!ids.has(h.id)) throw new Error(`real-test.json: unknown faq id ${h.id}`)
const trainText = new Set(train.map((t) => t.question))
// A hand-written question that is word for word a training question measures nothing: left out.
const test = [...FAQ.map((e) => ({ question: e.test, id: e.id, source: 'held-out' })), ...hand.filter((h) => !trainText.has(h.question))]
for (const t of test) if (trainText.has(t.question)) throw new Error(`Test question also in training: ${t.question}`)

const score = (rows) => {
  let top1 = 0, top3 = 0
  const misses = []
  for (const r of rows) {
    const found = faqRetrieve(r.question).map((x) => x.id)
    if (found[0] === r.id) top1++
    if (found.includes(r.id)) top3++
    else misses.push(`${r.id} ← ${r.question} (got ${found[0] ?? '—'})`)
  }
  return { top1: top1 / rows.length, top3: top3 / rows.length, rows: rows.length, misses }
}
const baseline = score(test)

mkdirSync(OUT, { recursive: true })
const jsonl = (list) => list.map((r) => JSON.stringify(r)).join('\n') + '\n'
writeFileSync(`${OUT}/faq_entries.jsonl`, jsonl(FAQ.map((e) => ({ id: e.id, intent: e.intent, text: `${e.q[0]}. ${e.a.vi}` }))))
writeFileSync(`${OUT}/faq_train.jsonl`, jsonl(train))
writeFileSync(`${OUT}/faq_validation.jsonl`, jsonl(validation))
writeFileSync(`${OUT}/faq_test.jsonl`, jsonl(test))
writeFileSync(`${OUT}/faq_baseline.json`, JSON.stringify({ method: 'faqRetrieve (weighted word overlap)', top1: baseline.top1, top3: baseline.top3, rows: baseline.rows }, null, 2) + '\n')
console.log(`${FAQ.length} answers · ${train.length} training questions · ${test.length} test questions (${hand.length} hand-written)`)
console.log(`word baseline: top-1 ${(100 * baseline.top1).toFixed(1)}% · top-3 ${(100 * baseline.top3).toFixed(1)}%`)
if (process.argv.includes('--errors')) for (const m of baseline.misses) console.log('  ✗', m)
