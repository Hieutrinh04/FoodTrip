// Packs everything Colab needs to train the assistant into
// ml/foodtrip-assistant-colab.zip: the training code, the shared word
// splitter, and the generated data with its rule baseline. No .env, keys or
// account data — only the templates' output and the hand-written messages.
//
//   node scripts/generate-assistant-dataset.js && node scripts/eval-assistant.js && node scripts/generate-faq-dataset.js && node scripts/package-assistant-colab.js

import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = resolve(root, 'ml/assistant-colab-package')
const zip = resolve(root, 'ml/foodtrip-assistant-colab.zip')
const files = [
  ['ml/assistant/assistant_model.py', 'assistant_model.py'],
  ['ml/assistant/train_assistant.py', 'train_assistant.py'],
  ['ml/assistant/train_retriever.py', 'train_retriever.py'],
  ['ml/assistant/test_assistant.py', 'test_assistant.py'],
  ['ml/assistant/assistant_infer.py', 'assistant_infer.py'],
  ['ml/assistant/requirements-colab.txt', 'requirements-colab.txt'],
  ['ml/training/ner_preprocessing.py', 'ner_preprocessing.py'],
  ...['train', 'validation', 'test', 'real_test'].map((s) => [`ml/assistant/data/${s}.jsonl`, `data/${s}.jsonl`]),
  ['ml/assistant/data/labels.json', 'data/labels.json'],
  ['ml/assistant/data/baseline.json', 'data/baseline.json'],
  ...['entries', 'train', 'validation', 'test'].map((s) => [`ml/assistant/data/faq_${s}.jsonl`, `data/faq_${s}.jsonl`]),
  ['ml/assistant/data/faq_baseline.json', 'data/faq_baseline.json'],
]

rmSync(pkg, { recursive: true, force: true })
mkdirSync(resolve(pkg, 'data'), { recursive: true })
for (const [from, to] of files) {
  if (!existsSync(resolve(root, from))) throw new Error(`Missing ${from} — generate the data and the baseline first`)
  copyFileSync(resolve(root, from), resolve(pkg, to))
}
rmSync(zip, { force: true })
const entries = files.map(([, to]) => to)
const windowsTar = 'C:\\Windows\\System32\\tar.exe' // bsdtar writes a zip with -a; Git Bash's tar cannot
if (process.platform === 'win32' && existsSync(windowsTar)) execFileSync(windowsTar, ['-a', '-cf', zip, '-C', pkg, ...entries])
else execFileSync('zip', ['-X', '-q', zip, ...entries], { cwd: pkg })
console.log(`Wrote ${zip} (${(statSync(zip).size / 1024).toFixed(0)} KB, ${entries.length} files)`)
