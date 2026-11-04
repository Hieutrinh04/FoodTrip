// Food events — festivals, food fairs, night markets, walking streets
// (table food_events, migration 20261103130000). Nothing is seeded: every
// event was entered by an administrator or proposed by a partner and
// published by an administrator. Times are Vietnam time (UTC+7, no DST).

import { supabase, hasSupabase } from './supabaseClient.js'

const VN_MS = 7 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000
const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0) }
// Midnight (Vietnam) of the Vietnam calendar day containing `ms`, as a UTC timestamp.
const vnMidnight = (ms) => Math.floor((ms + VN_MS) / DAY_MS) * DAY_MS - VN_MS
const vnDateIso = (ms) => new Date(ms + VN_MS).toISOString().slice(0, 10)

/**
 * Where an event stands at `now`: 'ongoing', 'upcoming' or 'past', with the
 * start and end of the current or next occurrence (ms), or null when there is
 * none. A weekly event's window may run past midnight (18:00–02:00).
 */
export function eventStatus(event, now = Date.now()) {
  if (event.starts_at && event.ends_at) {
    const start = Date.parse(event.starts_at), end = Date.parse(event.ends_at)
    if (now < start) return { status: 'upcoming', start, end }
    if (now < end) return { status: 'ongoing', start, end }
    return { status: 'past', start: null, end: null }
  }
  const days = new Set(event.weekly_days ?? [])
  if (!days.size || !event.weekly_start || !event.weekly_end) return { status: 'past', start: null, end: null }
  const open = minutesOf(event.weekly_start), close = minutesOf(event.weekly_end)
  const length = ((close - open + 1440) % 1440 || 1440) * 60000
  const from = event.valid_from ? Date.parse(`${event.valid_from}T00:00:00+07:00`) : -Infinity
  const until = event.valid_until ? Date.parse(`${event.valid_until}T00:00:00+07:00`) + DAY_MS : Infinity
  // Yesterday's window may still be open past midnight; then the next eight days.
  for (let d = -1; d <= 8; d += 1) {
    const midnight = vnMidnight(now) + d * DAY_MS
    const weekday = new Date(midnight + VN_MS).getUTCDay()
    if (!days.has(weekday)) continue
    const start = midnight + open * 60000
    const end = start + length
    if (start < from || start >= until || end <= now) continue
    return { status: start <= now ? 'ongoing' : 'upcoming', start, end }
  }
  return { status: 'past', start: null, end: null }
}

const WEEKDAYS = {
  vi: ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}
const hhmm = (t) => String(t).slice(0, 5)
const dmy = (ms, lang) => new Date(ms).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
const time = (ms, lang) => new Date(ms).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })

/** When an event happens, in words: "20/11/2026 18:00 – 22/11/2026 22:00" or "Thứ 6, Thứ 7 · 18:00–23:00". */
export function eventSchedule(event, lang = 'vi') {
  if (event.starts_at && event.ends_at) {
    const s = Date.parse(event.starts_at), e = Date.parse(event.ends_at)
    return vnDateIso(s) === vnDateIso(e - 1)
      ? `${dmy(s, lang)} · ${time(s, lang)}–${time(e, lang)}`
      : `${dmy(s, lang)} ${time(s, lang)} – ${dmy(e, lang)} ${time(e, lang)}`
  }
  const days = [...(event.weekly_days ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[lang][d])
  const range = [event.valid_from && (lang === 'vi' ? `từ ${event.valid_from.split('-').reverse().join('/')}` : `from ${event.valid_from}`),
    event.valid_until && (lang === 'vi' ? `đến ${event.valid_until.split('-').reverse().join('/')}` : `until ${event.valid_until}`)].filter(Boolean).join(' ')
  return `${days.length === 7 ? (lang === 'vi' ? 'Hằng ngày' : 'Daily') : days.join(', ')} · ${hhmm(event.weekly_start)}–${hhmm(event.weekly_end)}${range ? ` (${range})` : ''}`
}

/** The event's name in the reader's language (the Vietnamese one when there is no English). */
export const eventTitle = (e, lang = 'vi') => (lang === 'en' && e.title_en) || e.title_vi

export const STATUS_LABEL = {
  ongoing: { vi: 'Đang diễn ra', en: 'On now' },
  upcoming: { vi: 'Sắp diễn ra', en: 'Upcoming' },
  past: { vi: 'Đã diễn ra', en: 'Ended' },
}

/** Events with their status, ongoing first, then soonest; past ones last. */
export function withStatus(events, now = Date.now()) {
  const rank = { ongoing: 0, upcoming: 1, past: 2 }
  return (events ?? []).map((e) => ({ ...e, when: eventStatus(e, now) }))
    .sort((a, b) => rank[a.when.status] - rank[b.when.status] || (a.when.start ?? Infinity) - (b.when.start ?? Infinity))
}

const COLUMNS = 'id,title_vi,title_en,summary,city_id,venue,address,lat,lng,starts_at,ends_at,weekly_days,weekly_start,weekly_end,valid_from,valid_until,is_free,price_note,official_url,image_url,status,review_note,created_by,created_at,reviewed_at'

/** Published events (optionally of one city). */
export async function listEvents({ cityId = null } = {}) {
  if (!hasSupabase) return []
  let query = supabase.from('food_events').select(COLUMNS).eq('status', 'published').limit(500)
  if (cityId) query = query.eq('city_id', cityId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getEvent(id) {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id ?? '')) return null
  const { data, error } = await supabase.from('food_events').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** The caller's own proposals (any status) — RLS decides what that is. */
export async function myEvents(userId) {
  if (!hasSupabase || !userId) return []
  const { data, error } = await supabase.from('food_events').select(COLUMNS).eq('created_by', userId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function isEventPartner() {
  if (!hasSupabase) return false
  const { data, error } = await supabase.rpc('is_food_event_partner')
  return !error && data === true
}

/**
 * The row to insert from the form, or { error } naming the field that is
 * wrong. Times typed in the form are Vietnam time.
 */
export function eventPayload(form) {
  const text = (v) => String(v ?? '').trim()
  const row = {
    title_vi: text(form.title_vi), title_en: text(form.title_en) || null, summary: text(form.summary),
    city_id: text(form.city_id), venue: text(form.venue), address: text(form.address) || null,
    is_free: form.is_free === '' || form.is_free == null ? null : form.is_free === true || form.is_free === 'true',
    price_note: text(form.price_note) || null, official_url: text(form.official_url) || null, image_url: text(form.image_url) || null,
    starts_at: null, ends_at: null, weekly_days: null, weekly_start: null, weekly_end: null,
    valid_from: text(form.valid_from) || null, valid_until: text(form.valid_until) || null,
  }
  if (row.title_vi.length < 3) return { error: 'title_vi' }
  if (row.summary.length < 10) return { error: 'summary' }
  if (!/^[a-z]{2,20}$/.test(row.city_id)) return { error: 'city_id' }
  if (row.venue.length < 2) return { error: 'venue' }
  for (const key of ['official_url', 'image_url']) if (row[key] && !/^https:\/\/\S+$/.test(row[key])) return { error: key }
  if (form.kind === 'weekly') {
    const days = (form.weekly_days ?? []).map(Number).filter((d) => d >= 0 && d <= 6)
    if (!days.length) return { error: 'weekly_days' }
    if (!/^\d{2}:\d{2}$/.test(form.weekly_start ?? '') || !/^\d{2}:\d{2}$/.test(form.weekly_end ?? '') || form.weekly_start === form.weekly_end) return { error: 'weekly_time' }
    if (row.valid_from && row.valid_until && row.valid_until < row.valid_from) return { error: 'valid_until' }
    Object.assign(row, { weekly_days: [...new Set(days)].sort(), weekly_start: form.weekly_start, weekly_end: form.weekly_end })
  } else {
    const at = (v) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v ?? '') ? new Date(`${v}:00+07:00`).toISOString() : null)
    const starts = at(form.starts_at), ends = at(form.ends_at)
    if (!starts) return { error: 'starts_at' }
    if (!ends || ends <= starts) return { error: 'ends_at' }
    Object.assign(row, { starts_at: starts, ends_at: ends, valid_from: null, valid_until: null })
  }
  return { row }
}

export async function proposeEvent(row) {
  const { data, error } = await supabase.from('food_events').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

export async function withdrawEvent(id) {
  const { error } = await supabase.from('food_events').delete().eq('id', id).eq('status', 'pending')
  if (error) throw error
}

// Administrators.
export async function adminEvents(status = 'pending') {
  let query = supabase.from('food_events').select(COLUMNS).order('created_at', { ascending: false }).limit(200)
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function setEventStatus(id, status, note = null) {
  const { error } = await supabase.from('food_events').update({ status, review_note: note || null }).eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('food_events').delete().eq('id', id)
  if (error) throw error
}
