import { resolveDestination } from './knowledgeBase.js'

/**
 * Reads a Vietnamese trip request without a language model.
 *
 * "Điền tự động" used to depend entirely on the parse-trip-request function,
 * which needs an Anthropic key; without one the button only ever said "AI chưa
 * được cấu hình". Most requests are formulaic enough to read with patterns —
 * "3 ngày ở Đà Lạt dưới 2 triệu, 2 người, thích cà phê, đi xe máy" — so this
 * handles those, and the model (when configured) handles the rest.
 *
 * Returns the same shape as the Edge Function, with `source: 'local'`, and only
 * the fields it actually found: a field it cannot read stays null rather than
 * being guessed, so the planner keeps whatever the traveller already chose.
 */

/**
 * Lowercase, accents off, đ → d — and nothing else. Unlike normalizeVi this
 * keeps punctuation, because "1,5 triệu" must not become "1 5 triệu", and it
 * keeps every character in place (Vietnamese letters fold one-to-one), so a
 * match position in the folded text is the same position in the original.
 */
function fold(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

const NUMBER_WORDS = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 }
const NUM = '(\\d+|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)'

function toNumber(token) {
  if (token == null) return null
  if (/^\d+$/.test(token)) return Number(token)
  return NUMBER_WORDS[token] ?? null
}

function readDuration(t) {
  // "3n2d", "3N2Đ" — days first, nights second.
  const compact = t.match(/\b(\d+)\s*n\s*(\d+)\s*d\b/)
  if (compact) return Number(compact[1])
  const days = t.match(new RegExp(`\\b${NUM}\\s*ngay\\b`))
  if (days) return toNumber(days[1])
  const nights = t.match(new RegExp(`\\b${NUM}\\s*dem\\b`))
  if (nights) return toNumber(nights[1]) + 1
  if (/\bcuoi tuan\b/.test(t)) return 2
  if (/\b(mot|1) tuan\b/.test(t)) return 7
  return null
}

function readPeople(t) {
  const n = t.match(new RegExp(`\\b${NUM}\\s*(nguoi|dua|ban|thanh vien|khach)\\b`))
  if (n) return toNumber(n[1])
  const group = t.match(/\b(nhom|doan|gia dinh)\s*(\d+)\b/)
  if (group) return Number(group[2])
  if (/\b(cap doi|vo chong|nguoi yeu|hai dua)\b/.test(t)) return 2
  if (/\b(mot minh|solo)\b/.test(t)) return 1
  return null
}

/** The first money amount in the text, in VND, and where it ends. */
function firstAmount(t) {
  const found = []
  // "1tr5", "1,5 triệu", "1.5tr", "2 triệu", "2 củ", "3m". The unit may be
  // followed straight by a digit ("1tr5"), so it is closed with a lookahead
  // rather than a word boundary.
  for (const m of t.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(trieu|tr|cu|m)(?![a-z])\s*(\d)?(?!\d)/g)) {
    const whole = Number(m[1].replace(',', '.'))
    const tail = m[3] ? Number(m[3]) / 10 : 0 // the "5" in "1tr5"
    found.push({ value: Math.round((whole + tail) * 1_000_000), index: m.index, end: m.index + m[0].length })
  }
  // "500k", "800 nghìn"
  for (const m of t.matchAll(/\b(\d+)\s*(k|nghin|ngan)\b/g)) {
    found.push({ value: Number(m[1]) * 1000, index: m.index, end: m.index + m[0].length })
  }
  return found.sort((a, b) => a.index - b.index)[0] ?? null
}

/**
 * The per-person, whole-trip budget the planner works in. A figure written
 * "mỗi ngày" is scaled by the trip length, and one written for "cả nhóm" is
 * split between the travellers — the same rules the model is told to follow.
 */
function readBudget(t, duration, people) {
  const money = firstAmount(t)
  if (!money) return null
  const after = t.slice(money.end, money.end + 20)
  let perPerson = money.value
  if (/^\s*(\/\s*|moi\s+|mot\s+|1\s+)?ngay\b/.test(after)) perPerson *= duration ?? 1
  if (/\b(ca nhom|ca doan|ca gia dinh|tong cong)\b/.test(t) && people > 1) perPerson = Math.round(perPerson / people)
  return perPerson
}

const TRANSPORT_PATTERNS = [
  ['bike', /\b(xe may|moto|xe tay ga|xe so)\b/],
  ['car', /\b(o to|oto|xe hoi|tu lai|lai xe|xe rieng)\b/],
  ['walk', /\b(di bo|walking)\b/],
  ['taxi', /\b(taxi|grab|xanh sm|goi xe)\b/],
]

const PREF_PATTERNS = [
  ['seafood', /\b(hai san|oc|tom|cua|ghe|muc)\b/],
  ['vegetarian', /\b(an chay|mon chay|do chay|thuan chay)\b/],
  ['coffee', /\b(ca phe|cafe|coffee)\b/],
  ['oldtown', /\b(pho co|co kinh|kien truc co)\b/],
  ['nightlife', /\b(ve dem|bar|pub|nhau|song dem)\b/],
  ['nature', /\b(thien nhien|nui|thac|rung|san may|trekking|leo nui)\b/],
]

// A destination is usually introduced by one of these…
const DEST_INTRO = /\b(o|di|toi|den|ve|tai|du lich|ghe)\s+/g
// …and runs until the next detail starts.
const DEST_STOP = /\s*(,|\.|;|\bduoi\b|\bkhoang\b|\btam\b|\bvoi\b|\bcung\b|\bthich\b|\bdi xe\b|\bbang\b|\bngan sach\b|\bcho\b|\btrong\b|\bchi\b|\d)/

function readDestination(original, t) {
  // Try each "ở …", "đi …" phrase in turn; the first that resolves to one of
  // our cities wins. The phrase is cut from the original text (positions line
  // up, see fold) so a custom destination keeps its Vietnamese spelling for
  // the live search that follows.
  for (const m of t.matchAll(DEST_INTRO)) {
    const start = m.index + m[0].length
    const rest = t.slice(start)
    const stop = rest.search(DEST_STOP)
    const length = (stop === -1 ? rest : rest.slice(0, stop)).trimEnd().length
    const folded = t.slice(start, start + length)
    if (folded.length < 2 || /^(an|choi|du lich|xe|mot|lai)\b/.test(folded)) continue
    const phrase = original.slice(start, start + length).trim()
    const resolved = resolveDestination(phrase)
    if (resolved?.type === 'curated') return { cityId: resolved.cityId, destinationQuery: phrase }
    // An unknown place is only trusted when it is short enough to be a name.
    if (resolved?.type === 'custom' && phrase.split(/\s+/).length <= 4) return { cityId: null, destinationQuery: phrase }
  }
  // No introducing word: accept the whole text only if it clearly names or
  // describes one of our cities ("Đà Lạt 3 ngày", "biển miền Trung").
  const whole = resolveDestination(original)
  if (whole?.type === 'curated') return { cityId: whole.cityId, destinationQuery: null }
  return { cityId: null, destinationQuery: null }
}

export function parseTripRequestLocally(text) {
  const original = (text ?? '').normalize('NFC')
  const t = fold(original)
  const duration = readDuration(t)
  const people = readPeople(t)
  const budgetPerPerson = readBudget(t, duration, people)
  const transport = TRANSPORT_PATTERNS.find(([, re]) => re.test(t))?.[0] ?? null
  const prefs = PREF_PATTERNS.filter(([, re]) => re.test(t)).map(([tag]) => tag)
  const { cityId, destinationQuery } = readDestination(original, t)

  const found = [duration, people, budgetPerPerson, transport, cityId ?? destinationQuery].filter((v) => v != null).length + prefs.length
  return {
    source: 'local',
    cityId,
    destinationQuery,
    placeIds: [],
    duration,
    budgetPerPerson,
    people,
    transport,
    prefs,
    // Nothing recognisable at all — the caller says so instead of claiming to
    // have filled a form it left untouched.
    empty: found === 0,
  }
}
