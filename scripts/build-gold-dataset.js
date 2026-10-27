// Step 3 of ml/training/CRITERIA.md — the v3 training set from REVIEWED labels.
//
// Inputs
//   ml/review/<split>-reviewed.json  exported by ml/review/review.html, for
//                                    split = test, val, train (real captions
//                                    already in the dataset) and new (crawled
//                                    by scripts/crawl-caption-candidates.js)
//   ml/colab-package/data/*.jsonl    the template sentences, kept for training
//                                    and for the separate template scores
//
// Gold mode (default) keeps only captions a person approved. `--labels
// suggested` builds the same set from the suggested labels instead, to try
// the pipeline before the review is done; its report says the labels are
// silver, and it is never packaged without `--allow-silver`.
//
// Splitting: everything that names the same venue (any spelling — accents and
// leading "quán / nhà hàng / tiệm …" are ignored), shares a video, or was
// grouped together before stays in ONE partition. Captions already in
// validation/test stay there; new captions with no tie are spread 45% test,
// 20% validation, 35% train, so test gets the negative captions it lacked.
//
// Usage: node scripts/build-gold-dataset.js [--labels gold|suggested] [--package] [--allow-silver]

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tokenizeCaption, TOKENIZER_VERSION } from './lib/captionTokens.js'
import { NER_LABELS, canonical, coreName, fingerprint, validateNerRow } from './lib/nerDataset.js'

const labels = process.argv.includes('suggested') ? 'suggested' : 'gold'
const ml = new URL('../ml/', import.meta.url)
const read = (path) => JSON.parse(readFileSync(new URL(path, ml), 'utf8'))

const SOURCE = { 'youtube-real': 'youtube-real', tiktok: 'tiktok-real', generic: 'video-real' }
const spans = (tokens, tags, label) => {
  const out = []
  tags.forEach((tag, i) => {
    if (tag === `B-${label}`) out.push([tokens[i]])
    else if (tag === `I-${label}` && out.length) out.at(-1).push(tokens[i])
  })
  return out.map((parts) => parts.join(' '))
}
const youtubeId = (url) => url?.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1]

// ---- real captions from the review ----
const rows = []
const reviewInfo = {}
for (const split of ['test', 'val', 'train', 'new']) {
  const reviewedFile = `review/${split}-reviewed.json`
  const reviewed = existsSync(new URL(reviewedFile, ml))
  if (labels === 'gold' && !reviewed) { reviewInfo[split] = 'not reviewed yet — skipped'; continue }
  const set = read(reviewed ? reviewedFile : `review/${split}-review.json`)
  const reviewers = new Set()
  let used = 0
  for (const it of set.items) {
    const status = reviewed ? it.status : 'pending'
    if (labels === 'gold' && status !== 'approved') continue
    if (labels === 'suggested' && (status === 'removed' || (!reviewed && it.flag === 'X'))) continue
    if (it.reviewed_by) reviewers.add(it.reviewed_by)
    const tags = reviewed ? it.gold_tags : it.suggested_tags
    const videos = (it.video_ids ?? []).map((v) => youtubeId(v) ?? v)
    rows.push({
      tokens: it.tokens, ner_tags: tags, source: SOURCE[it.source] ?? it.source, original: split === 'new' ? null : split,
      video_ids: videos, keys: [...(it.group_id ? [split === 'new' ? `venue:${coreName(it.group_id)}` : `g:${it.group_id}`] : []), ...videos.map((v) => `v:${v}`)],
      reviewed: status === 'approved',
    })
    used++
  }
  reviewInfo[split] = { file: reviewedFile.replace('.json', reviewed ? '.json' : ' (missing — suggested labels used)'), captions: used, reviewers: [...reviewers] }
}

// ---- template sentences, re-split with tokenizer v2 ----
let templates = 0
for (const split of ['train', 'val_template', 'test_template']) {
  const file = new URL(`colab-package/data/${split}.jsonl`, ml)
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line)
    if (row.source === 'youtube-real') continue
    const tokens = [], tags = []
    row.tokens.forEach((token, i) => tokenizeCaption(token).forEach((piece, j) => {
      tokens.push(piece)
      tags.push(j === 0 || row.ner_tags[i] === 'O' ? row.ner_tags[i] : 'I-' + row.ner_tags[i].slice(2))
    }))
    rows.push({ tokens, ner_tags: tags, source: row.source, original: null, template: true, video_ids: [], keys: row.group_id ? [`g:${row.group_id}`] : [] })
    templates++
  }
}

// ---- validate, de-duplicate ----
const quarantine = []
const byText = new Map()
for (const row of rows) {
  try { validateNerRow(row) } catch (e) { quarantine.push({ ...row, reason: e.message }); continue }
  const key = canonical(row.tokens.join(' '))
  const prev = byText.get(key)
  if (!prev) { byText.set(key, row); continue }
  if (prev.ner_tags.join() !== row.ner_tags.join()) {
    // A reviewed real caption outranks a template or an unreviewed copy.
    const keep = row.reviewed && !prev.reviewed ? row : prev
    quarantine.push({ ...(keep === row ? prev : row), reason: 'conflicting-labels (other copy kept)' })
    byText.set(key, keep)
  } else {
    prev.keys.push(...row.keys); prev.video_ids = [...new Set([...prev.video_ids, ...row.video_ids])]
    prev.original ??= row.original
  }
}
const unique = [...byText.values()]
for (const row of unique) row.keys.push(...spans(row.tokens, row.ner_tags, 'BUSINESS').map((n) => `name:${coreName(n)}`), `text:${canonical(row.tokens.join(' '))}`)

// ---- group (union-find over shared keys) ----
const parent = unique.map((_, i) => i)
const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
const owner = new Map()
unique.forEach((row, i) => { for (const k of row.keys) { if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i) } })
const groups = new Map()
unique.forEach((row, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(row) })

// ---- partition ----
const splits = { train: [], val: [], test: [], val_template: [], test_template: [] }
for (const group of groups.values()) {
  const keys = [...new Set(group.flatMap((r) => r.keys))].sort()
  const groupId = fingerprint(JSON.stringify(keys)).slice(0, 24)
  const bucket = parseInt(groupId.slice(0, 8), 16) / 0x100000000
  const real = group.filter((r) => !r.template)
  const partition = real.some((r) => r.original === 'test') ? 'test'
    : real.some((r) => r.original === 'val') ? 'val'
      : real.some((r) => r.original === 'train') ? 'train'
        : real.length ? (bucket < 0.45 ? 'test' : bucket < 0.65 ? 'val' : 'train')
          : (bucket < 0.8 ? 'train' : bucket < 0.9 ? 'val' : 'test')
  for (const row of group) {
    const name = row.template && partition !== 'train' ? `${partition}_template` : partition
    splits[name].push({ tokens: row.tokens, ner_tags: row.ner_tags, source: row.source, video_ids: row.video_ids, group_id: groupId })
  }
}
for (const list of Object.values(splits)) list.sort((a, b) => fingerprint(a.tokens.join(' ')).localeCompare(fingerprint(b.tokens.join(' '))))

// ---- leakage check: no venue, text or video in two partitions ----
const seen = new Map()
for (const [name, list] of Object.entries(splits)) for (const row of list) {
  const part = name.split('_')[0]
  for (const k of [...spans(row.tokens, row.ner_tags, 'BUSINESS').map((n) => `name:${coreName(n)}`), ...row.video_ids.map((v) => `v:${v}`), `text:${canonical(row.tokens.join(' '))}`]) {
    if (seen.has(k) && seen.get(k) !== part) throw new Error(`cross-partition leak: ${k} (${seen.get(k)} / ${part})`)
    seen.set(k, part)
  }
}

// ---- write ----
const version = labels === 'gold' ? 'v3' : 'v3-silver'
const out = new URL(`datasets/${version}/`, ml)
mkdirSync(out, { recursive: true })
const files = {}
for (const [name, list] of Object.entries(splits)) files[`${name}.jsonl`] = list.map((r) => JSON.stringify(r)).join('\n') + '\n'
files['labels.json'] = JSON.stringify(NER_LABELS, null, 2) + '\n'
files['quarantine.jsonl'] = quarantine.map((r) => JSON.stringify(r)).join('\n') + '\n'
const negatives = (list) => list.filter((r) => !r.ner_tags.some((t) => t.endsWith('BUSINESS'))).length
const report = {
  version, created: new Date().toISOString(), labels: labels === 'gold' ? 'gold (human-reviewed, approved only)' : 'SILVER (suggested labels, not reviewed) — not for reporting quality',
  caption_tokenizer: TOKENIZER_VERSION, review: reviewInfo, template_sentences: templates, quarantined: quarantine.length, groups: groups.size,
  counts: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, v.length])),
  negative_captions: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, negatives(v)])),
  sources: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, v.reduce((a, r) => ({ ...a, [r.source]: (a[r.source] ?? 0) + 1 }), {})])),
  sha256: Object.fromEntries(Object.entries(files).filter(([n]) => n.endsWith('.jsonl')).map(([n, t]) => [n, fingerprint(t)])),
  split_policy: 'Venue (accent/type-word-insensitive), video and earlier group ties keep captions in one partition; earlier val/test captions stay there; untied new captions 45/20/35 test/val/train.',
}
files['dataset-report.json'] = JSON.stringify(report, null, 2) + '\n'
for (const [name, text] of Object.entries(files)) writeFileSync(new URL(name, out), text, 'utf8')
console.log(JSON.stringify({ output: out.pathname, ...report, sha256: undefined, sources: undefined }, null, 2))

// ---- package for Colab ----
if (process.argv.includes('--package')) {
  if (labels !== 'gold' && !process.argv.includes('--allow-silver')) {
    console.error('\nRefusing to package silver labels for training. Review the captions first, or pass --allow-silver for a trial run.')
    process.exit(1)
  }
  const pkg = new URL(`colab-package-${version}/`, ml)
  mkdirSync(new URL('data/', pkg), { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(new URL(`data/${name}`, pkg), text, 'utf8')
  const code = ['ner_preprocessing.py', 'test_preprocessing.py', 'tokenizer-cases.json', 'check_segmentation.py', 'check_tokenization.py', 'train_ner.py', 'check_onnx.py', 'requirements-colab.txt', 'README.md']
  for (const name of code) copyFileSync(new URL(`training/${name}`, ml), new URL(name, pkg))
  // The notebooks expect these files at the top of the zip, not inside a folder.
  const entries = [...Object.keys(files).map((name) => `data/${name}`), ...code]
  const zip = fileURLToPath(new URL(`foodtrip-ner-colab-${version}.zip`, ml))
  rmSync(zip, { force: true })
  const windowsTar = 'C:\\Windows\\System32\\tar.exe' // bsdtar: writes zip with -a; Git Bash's tar cannot
  if (process.platform === 'win32' && existsSync(windowsTar)) execFileSync(windowsTar, ['-a', '-cf', zip, '-C', fileURLToPath(pkg), ...entries])
  else execFileSync('zip', ['-X', '-q', zip, ...entries], { cwd: fileURLToPath(pkg) })
  console.log(`\nPackage: ${zip}\nUpload it as a Kaggle Dataset (ml/training/KAGGLE.md) or in the Colab notebook.`)
}
