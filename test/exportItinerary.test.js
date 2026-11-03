import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { buildItineraryWorkbook } from '../src/lib/exportItinerary.js'

const options = { city:{ id:'hoian',name:{vi:'Hội An',en:'Hoi An'} },days:[[{placeId:'missing-place',time:'08:00'}]],startDate:'2099-10-02',people:3,budget:1500000,transport:'walk',lang:'vi' }
test('Excel retains unknown places rather than silently dropping itinerary stops', () => {
  const workbook=buildItineraryWorkbook(options)
  const rows=XLSX.utils.sheet_to_json(workbook.Sheets['Lịch trình'],{header:1})
  assert.ok(rows.some((r) => r.includes('missing-place')))
  assert.deepEqual(workbook.SheetNames,['Lịch trình'])
})
test('Excel includes selected tours, numeric quotes and Vietnam times, not a paid receipt', () => {
  const tour={id:'departure-test',title:'=1+1',operator_name:'Test operator',meeting_point:'Test street',starts_at:'2099-10-01T23:30:00Z',ends_at:'2099-10-02T05:00:00Z',price:250000}
  const workbook=buildItineraryWorkbook({...options,tours:[tour]})
  const result=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'})
  const sheet=result.Sheets['Tour đã chọn']
  assert.match(sheet.A1.v,/không phải vé/)
  assert.equal(sheet.A3.t,'s'); assert.equal(sheet.A3.f,undefined)
  assert.equal(sheet.D3.v,'2099-10-02 06:30'); assert.equal(sheet.E3.v,'2099-10-02 12:00')
  assert.equal(sheet.F3.v,250000); assert.equal(sheet.H3.v,750000)
  assert.equal(sheet.I3.v,'departure-test')
})

test('Excel distinguishes Hotelbeds test references from partner-supplied prices in both languages', () => {
  const hotels = [{ name: 'Provider example', priceSource: 'hotelbeds', priceFrom: 400000 }, { name: 'Partner example', priceSource: 'partner', priceFrom: 500000 }]
  for (const lang of ['vi', 'en']) {
    const workbook = buildItineraryWorkbook({ ...options, hotels, lang })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[lang === 'vi' ? 'Khách sạn' : 'Hotels'], { header: 1 })
    assert.match(rows[1][3], lang === 'vi' ? /tham khảo.*thử nghiệm.*chưa phải giá đặt được/ : /reference.*test.*not a bookable rate/)
    assert.equal(rows[2][3], lang === 'vi' ? 'Giá do cơ sở cung cấp' : 'Property-supplied price')
  }
})
