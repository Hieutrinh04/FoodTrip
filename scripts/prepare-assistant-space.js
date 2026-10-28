// Assembles the Hugging Face Space for the trained assistant in
// ml/assistant-space/ (git-ignored): the app (ml/assistant/space), the Python
// it needs, and the model from the zip the Colab notebook downloads.
//
//   node scripts/prepare-assistant-space.js path/to/foodtrip-assistant-trained.zip

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const archive = process.argv[2] && resolve(process.argv[2])
if (!archive || !existsSync(archive)) throw new Error('usage: node scripts/prepare-assistant-space.js <foodtrip-assistant-trained.zip>')
const out = resolve(root, 'ml/assistant-space')
const unpacked = resolve(root, 'ml/assistant-space-unpacked')

rmSync(out, { recursive: true, force: true })
rmSync(unpacked, { recursive: true, force: true })
mkdirSync(unpacked, { recursive: true })
const windowsTar = 'C:\\Windows\\System32\\tar.exe'
execFileSync(process.platform === 'win32' && existsSync(windowsTar) ? windowsTar : 'tar', ['-xf', archive, '-C', unpacked])
for (const name of ['model.onnx', 'assistant.json', 'export-check.json']) {
  if (!existsSync(resolve(unpacked, 'onnx', name))) throw new Error(`The zip has no onnx/${name} — is it foodtrip-assistant-trained.zip?`)
}
const check = JSON.parse(readFileSync(resolve(unpacked, 'onnx/export-check.json'), 'utf8'))
if (!check.passed) throw new Error('The ONNX export did not pass its check against PyTorch')

cpSync(resolve(root, 'ml/assistant/space'), out, { recursive: true })
for (const file of ['ml/assistant/assistant_model.py', 'ml/assistant/assistant_infer.py', 'ml/training/ner_preprocessing.py']) {
  copyFileSync(resolve(root, file), resolve(out, file.split('/').pop()))
}
cpSync(resolve(unpacked, 'onnx'), resolve(out, 'model'), { recursive: true })
// The answer retriever, when it was trained too, with the FAQ entries it matches against.
if (existsSync(resolve(unpacked, 'retriever/retriever.onnx'))) {
  const retrieverCheck = JSON.parse(readFileSync(resolve(unpacked, 'retriever/retriever-check.json'), 'utf8'))
  if (!retrieverCheck.passed) throw new Error('The retriever export did not pass its check')
  cpSync(resolve(unpacked, 'retriever'), resolve(out, 'retriever'), { recursive: true })
  copyFileSync(resolve(root, 'ml/assistant/data/faq_entries.jsonl'), resolve(out, 'faq_entries.jsonl'))
  console.log('With the answer retriever (POST /answer).')
}
rmSync(unpacked, { recursive: true, force: true })
console.log(`Space ready in ${out} — see its README.md to upload it.`)
