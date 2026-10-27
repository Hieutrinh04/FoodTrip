// Answers the assistant computes from FoodTrip's own data, for the trip being
// talked about: what it would cost, the weather, and a place's facts. Every
// figure says where it comes from, and what FoodTrip has no data for is said,
// not filled in (see honest-place-facts: no made-up prices or hours).

import { getCity, getPlacesByCity } from '../data/destinations.js'
import { searchHotelsForCity, hasRealPrice } from './hotelSearch.js'
import { nightlyPriceOf } from './roomTypes.js'
import { destinationWeatherLocation, fetchTripWeather, isWithinForecastWindow, seasonalTravelRisk, summarizeTripWeather } from './tripWeather.js'
import { fetchPlaceDetails, todayHours } from './placeDetails.js'
import { searchPlaces } from './trackAsia.js'
import { planFields } from './assistant.js'
import { datePhrases, parseTripDate } from './tripDates.js'
import { normalizeVi } from './text.js'


const vnd = (n) => `${Math.round(n / 1000) * 1000 >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('vi-VN') + ' triệu' : Math.round(n / 1000).toLocaleString('vi-VN') + 'k'}`
const range = (lo, hi) => (Math.abs(hi - lo) < 1000 ? vnd(lo) : `${vnd(lo)} – ${vnd(hi)}`)
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The trip a message is about: what it says, over the trip the conversation
 * already settled (`before`, planner fields) — "chi phí bao nhiêu" after
 * "Hà Nội 2 ngày" is about Hà Nội, 2 days; "3 ngày thì sao" changes the length.
 */
export function tripInContext(message, slots, before = null) {
  const now = planFields(message, slots)
  if (!now.mentioned.dates.length) now.mentioned.dates = datePhrases(message)
  if (!before) return now
  const said = (v) => v != null && (!Array.isArray(v) || v.length)
  const merged = { ...before, mentioned: { ...before.mentioned } }
  for (const key of ['duration', 'people', 'budgetPerPerson', 'transport', 'prefs']) if (said(now[key])) merged[key] = now[key]
  // A new destination only when the message names it: the planner's reader also guesses a
  // city from a whole sentence, and "chi phí bao nhiêu" must not move the trip to Sài Gòn.
  if (namesPlace(message, now)) { merged.cityId = now.cityId; merged.destinationQuery = now.destinationQuery }
  for (const [key, value] of Object.entries(now.mentioned)) if (value.length) merged.mentioned[key] = value
  merged.empty = now.empty && before.empty
  return merged
}

/** Whether the message itself names the destination its fields carry. */
function namesPlace(message, fields) {
  const said = ` ${normalizeVi(message)} `
  // The city's names, and the phrase the message used for it ("Sài Gòn" for TP. Hồ Chí Minh).
  const names = [fields.destinationQuery, ...(fields.cityId ? [getCity(fields.cityId)?.name.vi, getCity(fields.cityId)?.name.en] : [])]
  return names.some((n) => n && said.includes(` ${normalizeVi(n)} `))
}

/** Whether a message changes details of the trip being talked about ("3 người thì sao", "đi xe máy"). */
export function changesTrip(message, slots) {
  const now = planFields(message, slots)
  return Boolean(namesPlace(message, now) || now.duration || now.people || now.budgetPerPerson || now.transport || now.prefs.length)
}

/** The trip as a request the planner's "Điền tự động" reads back into the same fields. */
export function requestFromTrip(trip, lang = 'vi') {
  const where = placeName(trip, 'vi')
  return [
    where && `đi ${where}`, trip.duration && `${trip.duration} ngày`, trip.people && `${trip.people} người`,
    trip.budgetPerPerson && `ngân sách ${Math.round(trip.budgetPerPerson / 1000)}k mỗi người`, trip.transport && `đi ${TRANSPORT_WORDS[trip.transport] ?? ''}`,
    trip.prefs?.length && `thích ${trip.prefs.map((p) => PREF_WORDS[p] ?? '').filter(Boolean).join(', ')}`,
  ].filter(Boolean).join(', ') || (lang === 'vi' ? 'lên lịch' : 'plan')
}
// Words tripRequestLocal.js reads back as the same field.
const TRANSPORT_WORDS = { bike: 'xe máy', car: 'ô tô', walk: 'đi bộ', taxi: 'taxi' }
const PREF_WORDS = { seafood: 'hải sản', vegetarian: 'ăn chay', coffee: 'cà phê', oldtown: 'phố cổ', nightlife: 'về đêm', nature: 'thiên nhiên' }

const placeName = (trip, lang) => (trip.cityId ? getCity(trip.cityId)?.name[lang] : trip.destinationQuery) ?? null
// What a meal costs at a curated place of each price tier (src/lib/pricing.js ranges).
const MEAL = { 0: [0, 0], 1: [20000, 60000], 2: [100000, 300000] }

/** What the trip would cost: rooms from real quoted rates, food from FoodTrip's places there. */
export async function estimateCost(trip, lang = 'vi') {
  const vi = lang === 'vi'
  const where = placeName(trip, lang)
  if (!where) return { text: vi ? 'Bạn định đi đâu, mấy ngày, mấy người? Ví dụ “Đà Lạt 3 ngày 2 người hết bao nhiêu?”.' : 'Where, how many days and people? E.g. “how much for 3 days in Da Lat for 2?”.' }
  const assumed = []
  const days = trip.duration ?? (assumed.push(vi ? '2 ngày' : '2 days'), 2)
  const people = trip.people ?? (assumed.push(vi ? '2 người' : '2 people'), 2)
  const nights = Math.max(0, days - 1)
  const rooms = Math.ceil(people / 2)
  const lines = []
  let lowPP = 0, highPP = 0, missing = []

  if (nights) {
    const hotels = await searchHotelsForCity({ cityName: where, adults: Math.min(people, 4), maxResultCount: 30 }).catch(() => null)
    const prices = (hotels ?? []).filter(hasRealPrice).map(nightlyPriceOf).filter((p) => p > 0).sort((a, b) => a - b)
    if (prices.length >= 3) {
      const q = (f) => prices[Math.min(prices.length - 1, Math.floor(f * (prices.length - 1)))]
      const [lo, hi] = [q(0.25) * nights * rooms, q(0.75) * nights * rooms]
      lowPP += lo / people; highPP += hi / people
      lines.push(vi ? `Ở: ${range(lo, hi)} cho ${nights} đêm, ${rooms} phòng (giá thật của ${prices.length} khách sạn đang mở bán, khoảng giữa)` : `Stay: ${range(lo, hi)} for ${nights} night(s), ${rooms} room(s) (real rates of ${prices.length} hotels, middle range)`)
    } else missing.push(vi ? 'giá phòng (chưa có đủ giá thật ở đây)' : 'rooms (not enough real rates here)')
  }

  const curated = trip.cityId ? getPlacesByCity(trip.cityId).filter((p) => ['food', 'cafe'].includes(p.category) && MEAL[p.price]) : []
  if (curated.length >= 3) {
    const lo = curated.reduce((s, p) => s + MEAL[p.price][0], 0) / curated.length
    const hi = curated.reduce((s, p) => s + MEAL[p.price][1], 0) / curated.length
    const meals = days * 3
    lowPP += lo * meals; highPP += hi * meals
    lines.push(vi ? `Ăn uống: ${range(lo * meals, hi * meals)}/người cho ${meals} bữa (theo mức giá ${curated.length} quán FoodTrip có ở ${where})` : `Food: ${range(lo * meals, hi * meals)} per person for ${meals} meals (price levels of ${curated.length} FoodTrip places in ${where})`)
  } else missing.push(vi ? `ăn uống (FoodTrip chưa có đủ giá quán ở ${where})` : `food (FoodTrip has too few priced places in ${where})`)

  const head = vi ? `Ước tính cho ${people} người, ${days} ngày ở ${where}${assumed.length ? ` (mình giả định ${assumed.join(', ')})` : ''}:` : `Estimate for ${people}, ${days} days in ${where}${assumed.length ? ` (assuming ${assumed.join(', ')})` : ''}:`
  const out = [head, ...lines.map((l) => `• ${l}`)]
  if (lines.length) out.push(vi ? `≈ ${range(lowPP, highPP)} mỗi người${missing.length ? ', chưa tính ' + missing.join(', ') : ''}. Chưa gồm vé xe/máy bay, vé tham quan, di chuyển trong thành phố.` : `≈ ${range(lowPP, highPP)} per person${missing.length ? ', not counting ' + missing.join(', ') : ''}. Travel there, tickets and local transport not included.`)
  else out.push(vi ? `Mình chưa có đủ dữ liệu giá để ước tính: ${missing.join('; ')}.` : `Not enough price data to estimate: ${missing.join('; ')}.`)
  if (lines.length && trip.budgetPerPerson) {
    const b = trip.budgetPerPerson
    out.push(highPP <= b ? (vi ? `Ngân sách ${vnd(b)}/người là đủ cho phần đã tính.` : `A budget of ${vnd(b)} per person covers what is counted.`)
      : lowPP > b ? (vi ? `Ngân sách ${vnd(b)}/người có thể thiếu khoảng ${vnd(lowPP - b)} trở lên.` : `${vnd(b)} per person may be short by ${vnd(lowPP - b)} or more.`)
        : (vi ? `Ngân sách ${vnd(b)}/người vừa đủ nếu chọn mức tiết kiệm.` : `${vnd(b)} per person is enough at the cheaper end.`))
  }
  return { text: out.join('\n'), links: [{ to: '/plan', label: vi ? 'Lên lịch với ngân sách này' : 'Plan with this budget' }] }
}

/** The forecast (up to 16 days ahead) or the season, for the trip's place and dates. */
export async function weatherAnswer(trip, lang = 'vi') {
  const vi = lang === 'vi'
  const where = placeName(trip, lang)
  if (!where) return { text: vi ? 'Bạn muốn xem thời tiết ở đâu, khi nào? Ví dụ “thời tiết Đà Lạt cuối tuần này”.' : 'Where and when? E.g. “weather in Da Lat this weekend”.' }
  let location = destinationWeatherLocation(trip.cityId)
  if (!location) location = (await searchPlaces(where, { limit: 1 }).catch(() => null))?.[0]?.location ?? null
  if (!location) return { text: vi ? `Mình chưa xác định được vị trí của ${where} để xem thời tiết.` : `I could not locate ${where} for the weather.` }
  const start = parseTripDate(trip.mentioned?.dates?.join(' ')) ?? isoOf(new Date())
  const days = Math.min(Math.max(trip.duration ?? 3, 1), 7)
  const when = vi ? `từ ${start.split('-').reverse().slice(0, 2).join('/')}, ${days} ngày` : `from ${start}, ${days} days`
  if (isWithinForecastWindow(start)) {
    const forecast = await fetchTripWeather({ location, startDate: start, duration: days }).catch(() => null)
    if (forecast?.days?.length) {
      const s = summarizeTripWeather(forecast.days)
      const lo = Math.round(Math.min(...forecast.days.map((d) => d.temperatureMin ?? 99)))
      const hi = Math.round(Math.max(...forecast.days.map((d) => d.temperatureMax ?? -99)))
      const text = vi
        ? `Dự báo ở ${where} ${when}: ${lo}–${hi}°C, ${s.rainyDays}/${s.totalDays} ngày có khả năng mưa${s.severeDays ? `, ${s.severeDays} ngày có thể mưa to/giông` : ''}${s.sunnyDays ? `, ${s.sunnyDays} ngày nắng đẹp` : ''}. ${s.rainyDays ? 'Nên mang áo mưa.' : ''}`
        : `Forecast for ${where} ${when}: ${lo}–${hi}°C, rain likely on ${s.rainyDays}/${s.totalDays} days${s.severeDays ? `, ${s.severeDays} with heavy rain or storms` : ''}${s.sunnyDays ? `, ${s.sunnyDays} sunny` : ''}.`
      return { text: `${text.trim()} (Open-Meteo)` }
    }
  }
  const season = seasonalTravelRisk({ cityId: trip.cityId, location, startDate: start, duration: days })
  const text = vi
    ? `${where} ${when}: quá xa để có dự báo. Theo mùa, ${season.inPeakStormSeason ? 'đây là cao điểm mưa bão' : season.inStormSeason ? 'có thể có bão' : season.inRainSeason ? 'đang mùa mưa' : 'thường ít mưa'}. Xem lại dự báo khi còn dưới 16 ngày.`
    : `${where} ${when}: too far ahead for a forecast. By season, ${season.inPeakStormSeason ? 'it is peak storm season' : season.inStormSeason ? 'storms are possible' : season.inRainSeason ? 'it is the rainy season' : 'it is usually dry'}. Check again within 16 days.`
  return { text }
}

/** A named place's hours, address and rating (place-details: stored places answer for free). */
export async function placeInfoAnswer(name, trip, lang = 'vi') {
  const vi = lang === 'vi'
  if (!name) return { text: vi ? 'Bạn hỏi quán nào? Ví dụ “Phở Thìn Lò Đúc mấy giờ mở cửa?”.' : 'Which place? E.g. “when does Phở Thìn Lò Đúc open?”.' }
  const area = placeName(trip, lang) ?? ''
  const details = await fetchPlaceDetails({ name, address: area }).catch(() => null)
  const p = details?.status === 'ok' ? details.place : null
  if (!p) return { text: vi ? `Mình chưa tìm thấy “${name}”${area ? ` ở ${area}` : ''}. Thử thêm khu vực hoặc tìm trong Khám phá.` : `I could not find “${name}”${area ? ` in ${area}` : ''}. Add the area or try Explore.`, links: [{ to: '/explore', label: vi ? 'Khám phá' : 'Explore' }] }
  const today = todayHours(p.hours)
  const lines = [
    `${p.name}${p.category ? ` · ${p.category}` : ''}`,
    p.address && (vi ? `Địa chỉ: ${p.address}` : `Address: ${p.address}`),
    today ? (vi ? `Hôm nay: ${today.raw ?? `${today.open}–${today.close}`}` : `Today: ${today.raw ?? `${today.open}–${today.close}`}`) : (vi ? 'Giờ mở cửa: Google chưa có' : 'Hours: not on Google'),
    p.rating != null && (vi ? `Google: ${p.rating}★ (${(p.ratingCount ?? 0).toLocaleString('vi-VN')} đánh giá)` : `Google: ${p.rating}★ (${p.ratingCount ?? 0} reviews)`),
    p.phone && (vi ? `Điện thoại: ${p.phone}` : `Phone: ${p.phone}`),
  ].filter(Boolean)
  return { text: lines.join('\n'), place: p, links: p.mapsUrl ? [{ href: p.mapsUrl, label: vi ? 'Xem trên Google Maps' : 'View on Google Maps' }] : [] }
}

/** The place a message asks about: the model's PLACE slot, else the words around "mấy giờ mở cửa / địa chỉ / ở đâu". */
export function askedPlace(message, slots) {
  const slot = slots?.find((s) => s.type === 'PLACE')?.text
  if (slot) return slot
  const cleaned = message.replace(/[?!.]+$/g, '').replace(/^(cho (mình|em|tôi) (hỏi|xin)|ad ơi|bạn ơi)\s*/i, '')
  const m = cleaned.match(/^(?:địa chỉ|giờ mở cửa của|số điện thoại|thông tin quán|review)\s+(.+?)(?:\s+(?:ở đâu|có ngon không|vậy|nhé))?$/i)
    ?? cleaned.match(/^(.+?)\s+(?:mấy giờ mở cửa|mở cửa lúc mấy giờ|ở đâu|có ngon không|được mấy sao|có đông không|còn mở không)/i)
  return m?.[1]?.trim() || null
}
