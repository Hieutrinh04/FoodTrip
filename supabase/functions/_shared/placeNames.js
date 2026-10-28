// Venue names compared the way people write them: any case, with or without
// accents, with or without a leading "quán / nhà hàng / tiệm …". Plain JS so
// the Edge Functions (Deno) and the Node scripts and tests share one copy.

export const canonical = (s) => String(s).normalize('NFC').replaceAll('_', ' ').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim()

/** Lower case, no accents, no punctuation: "Phở Thìn, Bờ Hồ!" → "pho thin bo ho". */
export const plain = (s) => canonical(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()

// Leading words that say what kind of place it is, not which one.
const TYPE_WORDS = ['quan an', 'quan ca phe', 'quan cafe', 'quan cf', 'quan', 'nha hang', 'tiem ca phe', 'tiem cafe', 'tiem', 'cua hang cafe', 'cua hang', 'cafe', 'ca phe', 'coffee', 'khach san', 'homestay', 'hai san']

/** A venue name reduced to what identifies it: no accents, punctuation or leading type words. */
export function coreName(name) {
  let s = plain(name)
  for (let changed = true; changed;) {
    changed = false
    for (const w of TYPE_WORDS) if (s.startsWith(w + ' ')) { s = s.slice(w.length + 1); changed = true }
  }
  return s
}

/** Whether two venue names point at the same place: equal cores, or one core inside the other. */
export function sameVenue(a, b) {
  const x = coreName(a), y = coreName(b)
  if (!x || !y) return false
  const within = (small, big) => ` ${big} `.includes(` ${small} `)
  return x === y || within(x, y) || within(y, x)
}
