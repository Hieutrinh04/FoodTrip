import * as XLSX from 'xlsx'
import { getPlace, TRANSPORT } from '../data/destinations.js'
import { priceRangeLabel } from './pricing.js'

function formatVnd(n) {
  return n.toLocaleString('vi-VN') + 'đ'
}

const HEADERS = {
  vi: ['Ngày', 'Giờ', 'Địa điểm', 'Loại điểm dừng', 'Địa chỉ', 'Đánh giá', 'Chi phí ước tính', 'Khoảng cách'],
  en: ['Day', 'Time', 'Place', 'Stop type', 'Address', 'Rating', 'Estimated cost', 'Distance'],
}

const SUMMARY_LABELS = {
  vi: { title: 'Lịch trình FoodTrip', destination: 'Điểm đến', startDate: 'Ngày khởi hành', duration: 'Thời gian', people: 'Số người', transport: 'Phương tiện', budget: 'Ngân sách/người (cả chuyến)', day: (n) => `Ngày ${n}` },
  en: { title: 'FoodTrip Itinerary', destination: 'Destination', startDate: 'Departure date', duration: 'Duration', people: 'People', transport: 'Transport', budget: 'Budget/person (whole trip)', day: (n) => `Day ${n}` },
}

const HOTEL_HEADERS = {
  vi: ['Khách sạn', 'Hạng sao', 'Giá từ / đêm', 'Nguồn giá', 'Đánh giá', 'Số lượt đánh giá', 'Địa chỉ', 'Link Google Maps'],
  en: ['Hotel', 'Stars', 'From / night', 'Price source', 'Rating', 'Review count', 'Address', 'Google Maps link'],
}

const HOTEL_SHEET_NAME = { vi: 'Khách sạn', en: 'Hotels' }

// The spreadsheet leaves the trip and gets read without the app around it, so
// it has to say on its own face which prices were quoted and which were guessed.
const PRICE_SOURCE_LABEL = {
  vi: { hotelbeds: 'Giá thật (Hotelbeds)', estimated: 'Ước tính' },
  en: { hotelbeds: 'Live rate (Hotelbeds)', estimated: 'Estimated' },
}

function buildHotelRows(hotels, lang) {
  return [
    HOTEL_HEADERS[lang],
    ...hotels.map((h) => [
      h.name,
      h.stars ?? '',
      h.priceFrom != null ? formatVnd(h.priceFrom) : '',
      PRICE_SOURCE_LABEL[lang][h.priceSource === 'hotelbeds' ? 'hotelbeds' : 'estimated'],
      h.rating ?? '',
      h.userRatingCount ?? '',
      h.address,
      h.mapsUri ?? '',
    ]),
  ]
}

function durationLabel(n, lang) {
  if (n === 1) return lang === 'vi' ? '1 ngày' : '1 day'
  return lang === 'vi' ? `${n} ngày ${n - 1} đêm` : `${n} days, ${n - 1} nights`
}

function buildRows({ city, days, startDate, people, budget, transport, lang }) {
  const s = SUMMARY_LABELS[lang]
  const rows = [
    [s.title],
    [s.destination, city.name[lang]],
    ...(startDate ? [[s.startDate, new Date(`${startDate}T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')]] : []),
    [s.duration, durationLabel(days.length, lang)],
    [s.people, people],
    [s.transport, TRANSPORT[transport][lang]],
    [s.budget, formatVnd(budget)],
    [],
    HEADERS[lang],
  ]

  days.forEach((day, dayIdx) => {
    day.forEach((stop) => {
      const place = getPlace(stop.placeId)
      if (!place) return
      rows.push([
        s.day(dayIdx + 1),
        stop.time,
        place.name[lang],
        stop.note[lang],
        place.address[lang],
        place.rating,
        priceRangeLabel(place.price, lang),
        stop.distance[lang],
      ])
    })
  })

  return rows
}

export function exportItineraryToExcel({ city, days, hotels = [], startDate, people, budget, transport, lang }) {
  const rows = buildRows({ city, days, startDate, people, budget, transport, lang })
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 32 }, { wch: 9 }, { wch: 20 }, { wch: 18 },
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, lang === 'vi' ? 'Lịch trình' : 'Itinerary')

  if (hotels.length) {
    const hotelSheet = XLSX.utils.aoa_to_sheet(buildHotelRows(hotels, lang))
    hotelSheet['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 14 }, { wch: 20 }, { wch: 9 }, { wch: 16 }, { wch: 32 }, { wch: 36 }]
    XLSX.utils.book_append_sheet(workbook, hotelSheet, HOTEL_SHEET_NAME[lang])
  }

  const fileName = `foodtrip-${city.id}-${days.length}${lang === 'vi' ? 'ngay' : 'day'}.xlsx`
  XLSX.writeFile(workbook, fileName)
}
