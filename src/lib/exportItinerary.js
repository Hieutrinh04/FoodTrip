import * as XLSX from 'xlsx'
import { getPlace, TRANSPORT } from '../data/destinations.js'
import { priceRangeLabel } from './pricing.js'
import { vnDate, vnTime } from './tourTrip.js'

function formatVnd(n) {
  return Number(n ?? 0).toLocaleString('vi-VN') + 'đ'
}
const localized = (value, lang, fallback = '') => typeof value === 'string' ? value : value?.[lang] ?? value?.vi ?? value?.en ?? fallback

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
    [s.destination, localized(city?.name,lang)],
    ...(startDate ? [[s.startDate, new Date(`${startDate}T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')]] : []),
    [s.duration, durationLabel(days.length, lang)],
    [s.people, people],
    [s.transport, localized(TRANSPORT[transport],lang,transport)],
    [s.budget, formatVnd(budget)],
    [],
    HEADERS[lang],
  ]

  days.forEach((day, dayIdx) => {
    day.forEach((stop) => {
      const place = getPlace(stop.placeId)
      rows.push([
        s.day(dayIdx + 1),
        stop.time,
        localized(place?.name,lang,stop.placeId),
        localized(stop.note,lang),
        localized(place?.address,lang),
        place?.rating ?? '',
        place ? priceRangeLabel(place.price, lang) : '',
        localized(stop.distance,lang),
      ])
    })
  })

  return rows
}

export function buildItineraryWorkbook({ city, days, hotels = [], tours = [], startDate, people, budget, transport, lang = 'vi' }) {
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

  if (tours.length) {
    const tourRows = [
      [lang === 'vi' ? 'Tour đã chọn — bản sao lịch trình, không phải vé hoặc xác nhận thanh toán. Kiểm tra trạng thái tại Đặt chỗ của tôi.' : 'Selected tours — itinerary copy, not a ticket or payment confirmation. Check My bookings for current status.'],
      lang === 'vi' ? ['Tour','Đơn vị tổ chức','Điểm hẹn','Khởi hành (UTC+7)','Kết thúc (UTC+7)','Giá tham khảo / người (VND)','Số người','Tổng tham khảo (VND)','Mã lịch khởi hành'] : ['Tour','Operator','Meeting point','Starts (UTC+7)','Ends (UTC+7)','Quoted price / person (VND)','People','Quoted total (VND)','Departure ID'],
      ...tours.map((tour) => [tour.title,tour.operator_name,tour.meeting_point,
        `${vnDate(tour.starts_at)} ${vnTime(tour.starts_at)}`,`${vnDate(tour.ends_at)} ${vnTime(tour.ends_at)}`,
        Number(tour.price),Number(people),Number(tour.price)*Number(people),tour.id]),
    ]
    const tourSheet = XLSX.utils.aoa_to_sheet(tourRows)
    tourSheet['!cols'] = [36,28,40,22,22,26,12,26,38].map((wch) => ({ wch }))
    tourSheet['!merges'] = [{ s:{ r:0,c:0 },e:{ r:0,c:8 } }]
    XLSX.utils.book_append_sheet(workbook,tourSheet,lang === 'vi' ? 'Tour đã chọn' : 'Selected tours')
  }
  return workbook
}

export function exportItineraryToExcel(options) {
  const { city, days, lang } = options
  const workbook = buildItineraryWorkbook(options)
  const fileName = `foodtrip-${city.id}-${days.length}${lang === 'vi' ? 'ngay' : 'day'}.xlsx`
  XLSX.writeFile(workbook, fileName)
}
