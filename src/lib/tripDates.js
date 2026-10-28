// Dates as people say them in a trip message — "cuối tuần này", "mai",
// "20/11", "từ 20 đến 22/12", "tháng 12", "tuần sau". Plain JS, no browser
// imports, so the test suite runs it directly.

// Accents off, punctuation kept: "20/11" must stay a date.
const stripAccents = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The first day a date phrase means, as an ISO date, or null. */
export function parseTripDate(text, today = new Date()) {
  const t = stripAccents(String(text ?? '')).toLowerCase()
  const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return isoOf(d) }
  if (/\bhom nay\b/.test(t)) return day(0)
  // "Mai Châu" is a place, not tomorrow.
  if (/\b(ngay )?mai\b(?! chau)/.test(t)) return day(1)
  // Saturday of this week (today when it is Saturday).
  if (/cuoi tuan/.test(t)) return day((6 - today.getDay() + 7) % 7)
  // Next Monday.
  if (/tuan sau|tuan toi/.test(t)) return day(((8 - today.getDay()) % 7) || 7)
  const dm = t.match(/(\d{1,2})\s*(?:(?:den|-|–)\s*\d{1,2}\s*)?\/\s*(\d{1,2})(?:\/(\d{2,4}))?/)
  if (dm) {
    const [d, m] = [Number(dm[1]), Number(dm[2])]
    let y = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : today.getFullYear()
    // A day already past this year is next year's.
    if (!dm[3] && new Date(y, m - 1, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate())) y++
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return isoOf(new Date(y, m - 1, d))
  }
  const month = t.match(/thang\s*(\d{1,2})\b/)
  if (month && Number(month[1]) >= 1 && Number(month[1]) <= 12) {
    const m = Number(month[1]) - 1
    if (m === today.getMonth()) return day(0)
    return isoOf(new Date(m < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear(), m, 1))
  }
  return null
}

/** Date phrases in a message, for when no model marked them (rules only). */
export function datePhrases(text) {
  const t = stripAccents(String(text ?? '')).toLowerCase()
  return [...t.matchAll(/hom nay|(?:ngay )?mai\b(?! chau)|cuoi tuan(?: nay| sau)?|tuan (?:sau|toi)|(?:tu )?\d{1,2}(?:\s*(?:den|-)\s*\d{1,2})?\s*\/\s*\d{1,2}(?:\/\d{2,4})?|thang \d{1,2}\b/g)].map((m) => m[0])
}
