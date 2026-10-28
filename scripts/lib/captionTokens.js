// Caption tokenizer v2 — the same rules as tokenize_caption() in
// ml/training/ner_preprocessing.py (both are checked against
// ml/training/tokenizer-cases.json). Training data and inference must split
// a caption identically, or the model sees different tokens in production.
//
// v1 split on whitespace and peeled punctuation off each end of a word, so
// separators *inside* a word stuck to it: "To/Đà", "Nẵng,ăn", "Hạnh-Huế",
// "XOFA_Xofa". v2 also splits there.

// Always a token of their own when inside a word.
const SEPARATORS = new Set(['/', ',', ';', '|', '(', ')', '[', ']', '"', '“', '”', '«', '»', '!', '?', '…'])
const isLetter = (c) => /\p{L}/u.test(c ?? '')
const isDigit = (c) => /\p{N}/u.test(c ?? '')
const isWordChar = (c) => isLetter(c) || isDigit(c)

/** Peels leading and trailing non-letter, non-digit runs off one piece. */
function peel(piece) {
  const chars = [...piece]
  let start = 0, end = chars.length
  while (start < end && !isWordChar(chars[start])) start++
  while (end > start && !isWordChar(chars[end - 1])) end--
  return [chars.slice(0, start).join(''), chars.slice(start, end).join(''), chars.slice(end).join('')].filter(Boolean)
}

export function tokenizeCaption(text) {
  const tokens = []
  // Underscores join words in hashtags and file-like titles; they never carry meaning.
  for (const raw of text.normalize('NFC').replace(/_/g, ' ').split(/\s+/)) {
    if (!raw) continue
    const chars = [...raw]
    let piece = ''
    const flush = () => { if (piece) tokens.push(...peel(piece)); piece = '' }
    chars.forEach((c, i) => {
      const prev = chars[i - 1], next = chars[i + 1]
      const split = SEPARATORS.has(c)
        || (c === ':' && !(isDigit(prev) && isDigit(next)))
        || ((c === '-' || c === '–') && isLetter(prev) && isLetter(next))
      if (split) { flush(); tokens.push(c) } else piece += c
    })
    flush()
  }
  return tokens
}

export const TOKENIZER_VERSION = 2
