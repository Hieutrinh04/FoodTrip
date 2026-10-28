// How well the assistant's rule baseline (supabase/functions/_shared/assistant/rules.js)
// reads intents, on the generated test split and the hand-written set — the
// bar the trained model (ml/assistant) has to beat.
//
//   node scripts/eval-assistant.js [--errors]

import { readFileSync, writeFileSync } from 'node:fs'
import { ruleIntent } from '../supabase/functions/_shared/assistant/rules.js'

const read = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const showErrors = process.argv.includes('--errors')
// Written beside the data, so the training report shows the model next to the rules.
const baseline = {}

for (const [name, key, file] of [['test (unseen phrasings)', 'test', 'ml/assistant/data/test.jsonl'], ['real_test (hand-written)', 'real_test', 'ml/assistant/data/real_test.jsonl']]) {
  const rows = read(file)
  const wrong = []
  const per = {}
  for (const row of rows) {
    const { intent } = ruleIntent(row.text)
    per[row.intent] ??= { n: 0, ok: 0 }
    per[row.intent].n++
    if (intent === row.intent) per[row.intent].ok++
    else wrong.push(`${row.intent} → ${intent}: ${row.text}`)
  }
  const ok = rows.length - wrong.length
  baseline[key] = { intent_accuracy: ok / rows.length, rows: rows.length, per_intent_accuracy: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v.ok / v.n])) }
  console.log(`${name.padEnd(26)} intent accuracy ${(100 * ok / rows.length).toFixed(1)}% (${ok}/${rows.length})`)
  console.log('  ' + Object.entries(per).map(([k, v]) => `${k} ${Math.round(100 * v.ok / v.n)}%`).join(' · '))
  if (showErrors) for (const w of wrong.slice(0, 40)) console.log('   ✗', w)
}
writeFileSync('ml/assistant/data/baseline.json', JSON.stringify({ method: 'rules (supabase/functions/_shared/assistant/rules.js)', ...baseline }, null, 2) + '\n')
