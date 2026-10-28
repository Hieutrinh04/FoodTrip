// Whether a video is someone's itinerary ("1 ngày ăn sập Hà Nội", "Đà Lạt 3N2Đ:
// ngày 1 sáng … trưa … tối …"), and if so which venue they went to on which day
// and at which time of day — read with rules from the caption, description and
// spoken words, so a plan like theirs can be drafted. Plain JS: Deno and Node.
//
// Everything is read on one lower-case accented text (canonical), so the
// positions of venue names and of "ngày 2" / "buổi trưa" / "7h30" line up.

import { canonical } from './placeNames.js'

const NUM = { 'một': 1, 'nhất': 1, 'đầu': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4, 'năm': 5, 'sáu': 6, 'bảy': 7, one: 1, two: 2, three: 3, four: 4, five: 5 }
const L = '[\\p{L}\\p{N}]'
// "ngày 1", "ngày thứ hai", "ngày đầu", "day 2" — the day a part of the video is about.
const DAY = new RegExp(`(?<!${L})(?:ngày|day)\\s+(?:thứ\\s+)?(\\d{1,2}|một|nhất|đầu|hai|ba|bốn|tư|năm|sáu|bảy|one|two|three|four|five)(?!${L})`, 'gu')
// "hôm sau", "ngày hôm sau", "ngày tiếp theo", "next day": the day after the one before.
const NEXT_DAY = new RegExp(`(?<!${L})(?:(?:ngày\\s+)?hôm\\s+sau|ngày\\s+tiếp\\s+theo|sáng\\s+hôm\\s+sau|next\\s+day|the\\s+day\\s+after)(?!${L})`, 'gu')
// How long the trip is: "3 ngày 2 đêm", "3n2đ", "2 days", "1 ngày".
const LENGTH = new RegExp(`(?<!${L})(\\d{1,2})\\s*(?:ngày|n(?=\\s*\\d\\s*đ)|days?)(?!${L})`, 'u')
// Times of day, and clock times ("7h", "7h30", "19:00", "7 giờ").
const PART = new RegExp(`(?<!${L})(?:buổi\\s+)?(sáng|trưa|chiều|tối|đêm|khuya|breakfast|morning|lunch|noon|afternoon|dinner|evening|night)(?!${L})(?!\\s+(?:đa|ưu|thiểu|giản|tạo|sủa|kiến))`, 'gu')
const CLOCK = new RegExp(`(?<!${L})([01]?\\d|2[0-3])\\s*(?:h|giờ|g|:)\\s*([0-5]\\d)?(?!${L})`, 'gu')
// Words that say the video is a plan or a route rather than one venue.
const PLAN_WORDS = /lịch trình|hành trình|food\s*tour|foodtour|itinerary|\d\s*n\s*\d\s*đ|\d+\s*ngày\s*\d+\s*đêm|(?:1|một)\s+ngày\s+(?:ăn|ở|tại|đi|khám)|\d+\s+days?\s+in|ăn\s+gì\s+trong\s+\d|đi\s+đâu\s*,?\s*ăn\s+gì/u

const PART_TIME = { 'sáng': '07:30', breakfast: '07:30', morning: '08:30', 'trưa': '12:00', lunch: '12:00', noon: '12:00', 'chiều': '15:00', afternoon: '15:00', 'tối': '19:00', dinner: '19:00', evening: '19:00', 'đêm': '21:30', night: '21:30', 'khuya': '22:30' }
// A day's stops without a time said, in the planner's own day rhythm.
const DEFAULT_TIMES = ['07:30', '09:30', '12:00', '15:00', '17:30', '19:00', '21:00']

const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toTime = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** What a stop is for, from its time: the labels the planner uses. */
export function slotFor(time) {
  const m = toMinutes(time)
  if (m < 10 * 60 + 30) return 'breakfast'
  if (m < 14 * 60) return 'lunch'
  if (m < 17 * 60 + 30) return 'experience'
  if (m < 20 * 60 + 30) return 'dinner'
  return 'evening'
}

/** Every match of a global regex with its position. */
const all = (re, s) => [...s.matchAll(re)].map((m) => ({ at: m.index, m }))

/**
 * @param text      caption + description + spoken words, as one text
 * @param mentions  venues the video names, [{ said, placeId? }] — any order
 * @param title     the title, which `text` starts with: a summary ("Huế 2 ngày: Cơm
 *                  Hến Hoa Đông, Phố Tây…"), so a venue is placed where the rest of
 *                  the text mentions it ("Sáng hôm sau … cơm hến Hoa Đông"), if it does
 * @returns null when this does not read as an itinerary, else
 *          { duration, days: [[{ said, placeId, time, slot }]] } in the video's order
 */
export function readPlan(text, mentions, { title = '' } = {}) {
  const s = canonical(String(text ?? '').slice(0, 12000))
  const skip = canonical(title).length
  const position = (said) => {
    const name = canonical(said)
    const later = s.indexOf(name, skip)
    const first = later < 0 ? s.indexOf(name) : later
    return first < 0 ? Infinity : first
  }
  const located = mentions
    .map((m, i) => ({ ...m, at: position(m.said), i }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
  const seen = new Set()
  const stops = located.filter((m) => { const key = m.placeId ?? canonical(m.said); if (seen.has(key)) return false; seen.add(key); return true })
  if (stops.length < 2) return null

  const days = all(DAY, s).map(({ at, m }) => ({ at, day: /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1]] }))
  const nexts = all(NEXT_DAY, s).map(({ at }) => ({ at, next: true }))
  const parts = all(PART, s).map(({ at, m }) => ({ at, time: PART_TIME[m[1]] }))
  const clocks = all(CLOCK, s).filter(({ m }) => m[2] || /h|giờ|g/.test(m[0])).map(({ at, m }) => ({ at, time: toTime(Number(m[1]) * 60 + Number(m[2] ?? 0)) }))
  const said = Number(s.match(LENGTH)?.[1] ?? 0)
  const isPlan = PLAN_WORDS.test(s) || days.length >= 2 || nexts.length > 0 || (parts.length >= 3 && stops.length >= 3)
  if (!isPlan) return null

  // Walk the text: each venue belongs to the last day marker and time said before it.
  const markers = [...days, ...nexts].sort((a, b) => a.at - b.at)
  const timeMarks = [...parts, ...clocks].sort((a, b) => a.at - b.at)
  let day = 1, mi = 0, ti = 0, time = null, dayStart = -1
  const placed = []
  for (const stop of stops) {
    while (mi < markers.length && markers[mi].at <= stop.at) {
      const mk = markers[mi++]
      const nextDay = mk.next ? day + 1 : mk.day
      if (nextDay && nextDay !== day) { day = nextDay; time = null }
      dayStart = mk.at
    }
    while (ti < timeMarks.length && timeMarks[ti].at <= stop.at) {
      if (timeMarks[ti].at >= dayStart) time = timeMarks[ti].time
      ti++
    }
    placed.push({ said: stop.said, placeId: stop.placeId ?? null, day: Math.min(Math.max(day, 1), 14), time })
  }

  // With "3 ngày" said but no day markers, the stops are spread over the days in order.
  const maxDay = Math.max(...placed.map((p) => p.day))
  let duration = Math.min(Math.max(maxDay, said || 1), 14)
  if (maxDay === 1 && duration > 1) {
    const per = Math.ceil(placed.length / duration)
    placed.forEach((p, i) => { p.day = Math.floor(i / per) + 1 })
    duration = Math.max(...placed.map((p) => p.day))
  }

  const out = Array.from({ length: duration }, () => [])
  for (const p of placed) out[p.day - 1].push(p)
  // Times only move forward within a day: an unsaid or earlier time takes the next free slot.
  return {
    duration,
    days: out.map((stopsOfDay) => {
      let last = -1
      return stopsOfDay.map((p, k) => {
        let min = p.time ? toMinutes(p.time) : toMinutes(DEFAULT_TIMES.find((t) => toMinutes(t) > last) ?? toTime(last + 90))
        if (min <= last) min = last + 60
        if (!p.time && k === 0 && min < 7 * 60) min = 7 * 60 + 30
        last = min
        const t = toTime(Math.min(min, 23 * 60 + 30))
        return { said: p.said, placeId: p.placeId, time: t, slot: slotFor(t) }
      })
    }),
  }
}
