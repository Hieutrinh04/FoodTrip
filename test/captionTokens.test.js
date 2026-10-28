import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tokenizeCaption } from '../scripts/lib/captionTokens.js'

// The same cases ml/training/test_preprocessing.py checks the Python tokenizer
// with: training data (JS) and inference (Python) must split captions alike.
const cases = JSON.parse(readFileSync(new URL('../ml/training/tokenizer-cases.json', import.meta.url), 'utf8'))

test('caption tokenizer v2 splits separators inside words', () => {
  for (const [text, expected] of cases) assert.deepEqual(tokenizeCaption(text), expected, text)
})
