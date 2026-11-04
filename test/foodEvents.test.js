import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventStatus, eventSchedule, eventPayload, withStatus } from '../src/lib/foodEvents.js'

const vn = (iso) => Date.parse(`${iso}+07:00`)
// 2026-11-06 is a Friday.
const friday = (hhmm) => vn(`2026-11-06T${hhmm}:00`)

test('a one-off event: upcoming, ongoing, past at its exact edges', () => {
  const e = { starts_at: '2026-11-20T18:00:00+07:00', ends_at: '2026-11-22T22:00:00+07:00' }
  assert.equal(eventStatus(e, vn('2026-11-20T17:59:59')).status, 'upcoming')
  assert.equal(eventStatus(e, vn('2026-11-20T18:00:00')).status, 'ongoing')
  assert.equal(eventStatus(e, vn('2026-11-22T21:59:59')).status, 'ongoing')
  assert.equal(eventStatus(e, vn('2026-11-22T22:00:00')).status, 'past')
})

test('a weekly night market, Friday and Saturday 18:00–23:00 Vietnam time', () => {
  const e = { weekly_days: [5, 6], weekly_start: '18:00', weekly_end: '23:00' }
  assert.equal(eventStatus(e, friday('17:00')).status, 'upcoming')
  assert.equal(eventStatus(e, friday('17:00')).start, friday('18:00'))
  assert.equal(eventStatus(e, friday('18:00')).status, 'ongoing')
  assert.equal(eventStatus(e, friday('23:00')).status, 'upcoming', 'after closing, the next is Saturday')
  assert.equal(eventStatus(e, friday('23:00')).start, vn('2026-11-07T18:00:00'))
  // Sunday after closing: next Friday.
  assert.equal(eventStatus(e, vn('2026-11-08T23:30:00')).start, vn('2026-11-13T18:00:00'))
})

test('a window past midnight is still open the next morning', () => {
  const e = { weekly_days: [6], weekly_start: '20:00', weekly_end: '02:00' }
  const sundayEarly = vn('2026-11-08T01:30:00')
  assert.equal(eventStatus(e, sundayEarly).status, 'ongoing')
  assert.equal(eventStatus(e, sundayEarly).end, vn('2026-11-08T02:00:00'))
  assert.equal(eventStatus(e, vn('2026-11-08T02:00:00')).status, 'upcoming')
})

test('a weekly event within its season only', () => {
  const e = { weekly_days: [5], weekly_start: '18:00', weekly_end: '22:00', valid_from: '2026-11-13', valid_until: '2026-11-27' }
  assert.equal(eventStatus(e, friday('19:00')).status, 'upcoming', 'not open before the season starts')
  assert.equal(eventStatus(e, friday('19:00')).start, vn('2026-11-13T18:00:00'))
  assert.equal(eventStatus(e, vn('2026-11-27T19:00:00')).status, 'ongoing', 'the last day counts')
  assert.equal(eventStatus(e, vn('2026-11-27T22:30:00')).status, 'past')
  assert.equal(eventStatus({ weekly_days: [], weekly_start: '18:00', weekly_end: '22:00' }, friday('19:00')).status, 'past')
})

test('ongoing first, then soonest, past last', () => {
  const now = friday('19:00')
  const list = withStatus([
    { id: 'past', starts_at: '2026-10-01T10:00:00+07:00', ends_at: '2026-10-01T12:00:00+07:00' },
    { id: 'later', starts_at: '2026-12-01T10:00:00+07:00', ends_at: '2026-12-01T12:00:00+07:00' },
    { id: 'now', weekly_days: [5], weekly_start: '18:00', weekly_end: '22:00' },
    { id: 'soon', starts_at: '2026-11-07T10:00:00+07:00', ends_at: '2026-11-07T12:00:00+07:00' },
  ], now)
  assert.deepEqual(list.map((e) => e.id), ['now', 'soon', 'later', 'past'])
})

test('schedules read as people write them', () => {
  assert.equal(eventSchedule({ weekly_days: [6, 5], weekly_start: '18:00:00', weekly_end: '23:00:00' }, 'vi'), 'Thứ 6, Thứ 7 · 18:00–23:00')
  assert.equal(eventSchedule({ weekly_days: [0, 1, 2, 3, 4, 5, 6], weekly_start: '17:00', weekly_end: '22:00' }, 'en'), 'Daily · 17:00–22:00')
  assert.match(eventSchedule({ starts_at: '2026-11-20T18:00:00+07:00', ends_at: '2026-11-20T22:00:00+07:00' }, 'vi'), /^20\/11\/2026 · 18:00–22:00$/)
})

test('the proposal form becomes a valid row, or names the wrong field', () => {
  const base = { title_vi: 'Chợ đêm Hồ Gươm', summary: 'Chợ đêm cuối tuần quanh hồ', city_id: 'hanoi', venue: 'Phố Hàng Đào' }
  const weekly = eventPayload({ ...base, kind: 'weekly', weekly_days: ['6', '5', '5'], weekly_start: '18:00', weekly_end: '23:00' })
  assert.deepEqual(weekly.row.weekly_days, [5, 6])
  assert.equal(weekly.row.starts_at, null)
  const once = eventPayload({ ...base, kind: 'once', starts_at: '2026-11-20T18:00', ends_at: '2026-11-22T22:00' })
  assert.equal(once.row.starts_at, '2026-11-20T11:00:00.000Z')
  assert.equal(eventPayload({ ...base, kind: 'once', starts_at: '2026-11-20T18:00', ends_at: '2026-11-20T17:00' }).error, 'ends_at')
  assert.equal(eventPayload({ ...base, kind: 'weekly', weekly_days: [] }).error, 'weekly_days')
  assert.equal(eventPayload({ ...base, official_url: 'http://x.vn', kind: 'once', starts_at: '2026-11-20T18:00', ends_at: '2026-11-20T20:00' }).error, 'official_url')
  assert.equal(eventPayload({ ...base, title_vi: 'x', kind: 'weekly' }).error, 'title_vi')
})
