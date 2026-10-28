import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datePhrases, parseTripDate } from '../src/lib/tripDates.js'

// Thursday 22 October 2026.
const today = new Date(2026, 9, 22)

test('reads the dates people say', () => {
  const cases = [
    ['hôm nay', '2026-10-22'], ['mai', '2026-10-23'], ['ngày mai', '2026-10-23'],
    ['cuối tuần này', '2026-10-24'], ['tuần sau', '2026-10-26'],
    ['20/11', '2026-11-20'], ['từ 20 đến 22/12', '2026-12-20'], ['5/1', '2027-01-05'], ['1/10', '2027-10-01'],
    ['tháng 12', '2026-12-01'], ['tháng 10', '2026-10-22'], ['tháng 3', '2027-03-01'],
  ]
  for (const [text, iso] of cases) assert.equal(parseTripDate(text, today), iso, text)
  assert.equal(parseTripDate('một ngày', today), null, '"một" is not "mốt"')
  assert.equal(parseTripDate('Đà Lạt', today), null)
})

test('finds date phrases in a message', () => {
  assert.deepEqual(datePhrases('thời tiết Đà Lạt cuối tuần này thế nào'), ['cuoi tuan nay'])
  assert.deepEqual(datePhrases('đi Huế từ 20 đến 22/12 có mưa không'), ['tu 20 den 22/12'])
  assert.deepEqual(datePhrases('Phú Quốc tháng 12 mưa nhiều không'), ['thang 12'])
  assert.deepEqual(datePhrases('đi Hội An 3 ngày 2 người'), [])
  assert.deepEqual(datePhrases('Mai Châu có lạnh không'), [], 'a place, not tomorrow')
})
