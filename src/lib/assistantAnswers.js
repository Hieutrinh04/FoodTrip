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
import { searchMapArea } from './mapAreaSearch.js'
import { fetchPlaceCatalog, mergePlaceCatalog } from './placeCatalog.js'
import { placesForDestination } from './plannerCatalog.js'
import { mergeFoodPreferences, matchesFoodPreferences, foodPreferenceNotes } from './assistantFoodPreferences.js'
import { dishLedSearch, blocksDishSearch, asksNearbyFood, isAmbiguousDishSearch } from '../../supabase/functions/_shared/assistant/dishRequest.js'


const vnd = (n) => `${Math.round(n / 1000) * 1000 >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('vi-VN') + ' triệu' : Math.round(n / 1000).toLocaleString('vi-VN') + 'k'}`
const range = (lo, hi) => (Math.abs(hi - lo) < 1000 ? vnd(lo) : `${vnd(lo)} – ${vnd(hi)}`)
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The trip a message is about: what it says, over the trip the conversation
 * already settled (`before`, planner fields) — "chi phí bao nhiêu" after
 * "Hà Nội 2 ngày" is about Hà Nội, 2 days; "3 ngày thì sao" changes the length.
 */
/**
 * What the server says it can take today, added to payment answers so the chat
 * never promises more than the booking page offers. Null when real transfers
 * are on, or when the state could not be read.
 */
export function paymentAvailabilityNote({ sepay, vnpay }, lang = 'vi') {
  const vi = lang === 'vi'
  if (sepay === 'mock') return vi ? 'Lưu ý: hiện thanh toán đang ở chế độ thử, không chuyển tiền thật và đơn được gắn nhãn DEMO.' : 'Note: payments are in test mode right now. No real money moves and orders are marked DEMO.'
  if (sepay === 'ready' || sepay === 'unknown' || vnpay === 'unknown') return null
  if (vnpay === 'ready') return vi ? 'Lưu ý: hiện chỉ có VNPay ở môi trường sandbox để thử, chưa nhận tiền thật.' : 'Note: only the VNPay sandbox is on right now, for testing. It does not take real money.'
  return vi ? 'Lưu ý: hiện web chưa mở thanh toán trực tuyến.' : 'Note: online payment is not open on the site yet.'
}

export function tripInContext(message, slots, before = null) {
  const now = planFields(message, slots)
  if (['do', 'day', 'nay', 'dau', 'the nao'].includes(normalizeVi(now.destinationQuery))) { now.destinationQuery = null; now.cityId = null }
  if (!now.mentioned.dates.length) now.mentioned.dates = datePhrases(message)
  if (!before) {
    if (!namesPlace(message, now)) { now.cityId = null; now.destinationQuery = null }
    return now
  }
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
  const generic = new Set(['do', 'day', 'nay', 'the nao', 'dau', 'quan do', 'quan nay'])
  return names.some((n) => n && !generic.has(normalizeVi(n)) && said.includes(` ${normalizeVi(n)} `))
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
    trip.mentioned?.dates?.length && trip.mentioned.dates.join(', '),
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
  if (!where) {
    // Only what is still missing is asked: "3 ngày 2 người hết bao nhiêu?" needs just the place.
    const known = trip.duration || trip.people
    return { text: vi ? (known ? 'Bạn định đi đâu?' : 'Bạn định đi đâu, mấy ngày, mấy người? Ví dụ “Đà Lạt 3 ngày 2 người hết bao nhiêu?”.') : (known ? 'Where are you going?' : 'Where, how many days and people? E.g. “how much for 3 days in Da Lat for 2?”.'), need: 'dest' }
  }
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
      lines.push(vi ? `Ở: ${range(lo, hi)} cho ${nights} đêm, ${rooms} phòng (khoảng giữa từ ${prices.length} nơi có giá; giá nhà cung cấp là tham khảo thử nghiệm, chưa phải giá đặt được; giá đối tác cần kiểm tra theo ngày đặt)` : `Stay: ${range(lo, hi)} for ${nights} night(s), ${rooms} room(s) (middle range from ${prices.length} priced properties; provider prices are test references, not bookable rates; check partner prices for your dates)`)
    } else missing.push(vi ? 'giá phòng (chưa có đủ dữ liệu giá ở đây)' : 'rooms (not enough price data here)')
  }

  const curated = trip.cityId ? getPlacesByCity(trip.cityId).filter((p) => ['food', 'cafe'].includes(p.category) && MEAL[p.price]) : []
  if (curated.length >= 3) {
    const lo = curated.reduce((s, p) => s + MEAL[p.price][0], 0) / curated.length
    const hi = curated.reduce((s, p) => s + MEAL[p.price][1], 0) / curated.length
    const meals = days * 3
    lowPP += lo * meals; highPP += hi * meals
    lines.push(vi ? `Ăn uống: ${range(lo * meals, hi * meals)}/người cho ${meals} bữa (tham khảo mức giá mẫu của ${curated.length} quán ở ${where}, chưa phải giá thực đơn đã xác minh)` : `Food: ${range(lo * meals, hi * meals)} per person for ${meals} meals (sample price bands for ${curated.length} places in ${where}, not verified menu prices)`)
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
  if (!where) return { text: vi ? 'Bạn muốn xem thời tiết ở đâu, khi nào? Ví dụ “thời tiết Đà Lạt cuối tuần này”.' : 'Where and when? E.g. “weather in Da Lat this weekend”.', need: 'dest' }
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
    return { text: vi ? `Mình chưa tải được dự báo cho ${where} ${when}. Bạn thử lại sau nhé; mình chưa có dữ liệu để kết luận trời nắng hay mưa.` : `The forecast for ${where} ${when} is unavailable. Please retry; I cannot establish whether it will rain.` }
  }
  const season = seasonalTravelRisk({ cityId: trip.cityId, location, startDate: start, duration: days })
  const text = vi
    ? `${where} ${when}: quá xa để có dự báo. Theo mùa, ${season.inPeakStormSeason ? 'đây là cao điểm mưa bão' : season.inStormSeason ? 'có thể có bão' : season.inRainSeason ? 'đang mùa mưa' : 'thường ít mưa'}. Xem lại dự báo khi còn dưới 16 ngày.`
    : `${where} ${when}: too far ahead for a forecast. By season, ${season.inPeakStormSeason ? 'it is peak storm season' : season.inStormSeason ? 'storms are possible' : season.inRainSeason ? 'it is the rainy season' : 'it is usually dry'}. Check again within 16 days.`
  return { text }
}

/** A named place's hours, address and rating (place-details: stored places answer for free). */
export async function placeInfoAnswer(name, trip, lang = 'vi', { load = fetchPlaceDetails, selected = null } = {}) {
  const vi = lang === 'vi'
  if (!name) return { text: vi ? 'Bạn hỏi quán nào? Ví dụ “Phở Thìn Lò Đúc mấy giờ mở cửa?”.' : 'Which place? E.g. “when does Phở Thìn Lò Đúc open?”.', need: 'place' }
  const area = placeName(trip, lang) ?? ''
  const details = await load({ name, address: selected?.address?.vi ?? area, location: selected?.location ?? null }).catch(() => null)
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

// Words that are not a dish ("ăn gì ngon", "quán nào").
const NOT_DISH = new Set(['gi', 'cai gi', 'mon gi', 'dau', 'nao', 'ngon', 'quan', 'mon', 'an', 'uong', 'an uong', 'am thuc'])
const DISH_END = /(?=\s+(?:ngon|nào|ở|tại|gần|quanh|đâu|giá|rẻ|cho|không|với|mở)(?:\s|$)|[?,.!]|$)/i

/** The dish a "find food" message asks for: the model's FOOD slot, else the words after "quán / món / ăn". */
export function askedDish(message, slots) {
  if (blocksDishSearch(message) || isAmbiguousDishSearch(message)) return null
  const led = dishLedSearch(message)
  if (led) return led
  const slot = slots?.find((s) => s.type === 'FOOD')?.text
  if (slot) return slot
  const english = message.match(/^(?:good|find|recommend)\s+(?:places?\s+for\s+)?(.+?)\s+(?:in|near|around)\s+/i)?.[1]
  if (english && !/^(?:food|restaurants?|places?)$/i.test(english)) return english.trim()
  const m = message.match(new RegExp(`(?:^|\\s)(?:quán|món|ăn|tìm|chỗ)\\s+(.+?)${DISH_END.source}`, 'i'))
  // "phở ngon ở Hà Nội": the dish opens the message.
  let dish = (m?.[1] ?? message.match(/^(.{2,30}?)\s+ngon(?:\s|$)/i)?.[1] ?? '').trim()
  // "quán phở dưới 100k": a price limit is a filter, not part of the dish.
  dish = dish.replace(/(?:^|\s+)(?:dưới|duoi|tầm|tam|khoảng|khoang|rẻ|re)(?:\s+.*)?$/i, '').trim()
  while (/^(quán|món|ăn|chỗ|bán)\s+/i.test(dish)) dish = dish.replace(/^(quán|món|ăn|chỗ|bán)\s+/i, '')
  const generic = normalizeVi(dish)
  return dish && !NOT_DISH.has(generic)
    && !/^(ngon|gi|nao|uong)(?:\s|$)/.test(generic)
    && !/\b(dia chi|dia diem|am thuc|cho an)\b/.test(generic)
    && dish.split(/\s+/).length <= 4 ? dish : null
}

/** The centre of the trip's area: FoodTrip's own city centre, else the map provider's geocode. */
async function locateArea(trip, where) {
  return destinationWeatherLocation(trip.cityId) ?? (await searchPlaces(where, { limit: 1 }).catch(() => null))?.[0]?.location ?? null
}

// Google's rating, weighted by how many people gave it (4.9★ from 3 reviews ranks below 4.6★ from 900).
const trusted = (p) => (p.googleRating ?? 0) * ((p.googleRatingCount ?? 0) / ((p.googleRatingCount ?? 0) + 20))

/** Provider keyword search is only candidate retrieval, not evidence of a menu. */
export function dishMatchStrength(place, dish) {
  if (!dish) return 0
  const needle = normalizeVi(dish)
  const strings = (value) => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings)
    : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
  const matches = (value) => strings(value).some((text) => {
    // Accented "phố" means street, not the dish "phở"; normalization alone
    // would treat a restaurant's "phố cổ" description as menu evidence.
    const evidence = needle === 'pho' ? text.replace(/phố/gi, '') : text
    const clauses = evidence.split(/[.;\n]/).map(normalizeVi)
    return clauses.some((clause) => ` ${clause} `.includes(` ${needle} `)
      && !['khong ban', 'khong co', 'khong phuc vu', 'no', 'does not serve'].some((negation) => ` ${clause} `.includes(` ${negation} ${needle} `)))
  })
  if (matches(place.name)) return 2
  return matches([place.shortDesc, place.description, place.dishes, place.menu, place.cuisine]) ? 1 : 0
}

/** A few real places for a dish in the trip's area, best rated first (one page of Google results, cached). */
export async function findFoodAnswer(message, slots, trip, lang = 'vi', { search = searchMapArea, locate = locateArea, catalog = fetchPlaceCatalog, excludeIds = [], preferences: before = {} } = {}) {
  const vi = lang === 'vi'
  const preferences = { ...mergeFoodPreferences(message), ...before }
  const dish = ['cafe', 'vegetarian'].includes(preferences.kind) ? null : askedDish(message, slots)
  const keyword = preferences.kind === 'cafe' ? 'quán cà phê' : preferences.kind === 'vegetarian' ? 'quán chay' : dish ?? 'quán ăn ngon'
  const subject = preferences.kind === 'cafe' ? (vi ? 'cà phê' : 'coffee') : preferences.kind === 'vegetarian' ? (vi ? 'chay' : 'vegetarian') : dish ?? (vi ? 'ăn' : 'food')
  const notes = foodPreferenceNotes(preferences, lang)
  // NearbyEats owns consent/GPS and its manual dish search. Do not silently
  // search the previous city's centre or request location from this chat.
  if (dish && asksNearbyFood(message)) return { preferences, text: vi
    ? `Bạn muốn tìm ${dish} gần mình. Mở “Ăn gì gần đây?” và bấm “Định vị & gợi ý cho tôi” để cho phép vị trí khi sẵn sàng. Nút này tìm quán ăn nói chung, chưa lọc riêng ${dish}. Để tìm đúng món bằng ô tìm kiếm, nhập “${dish}” kèm khu vực của bạn; ô này không tự dùng GPS. Mình chưa dùng vị trí của bạn để tìm quán.`
    : `You want ${dish} nearby. Open Nearby and use “Locate & suggest for me” to allow location when ready. That button finds food places in general, without a ${dish} filter. To search for this dish in the text field, enter “${dish}” with your area; the text field does not use GPS automatically. I have not used your location to search.`,
    links: [{ to: '/nearby', label: vi ? `Tìm ${dish} gần tôi` : `Find ${dish} nearby` }] }
  const where = placeName(trip, 'vi')
  if (!where) return { preferences, text: vi ? `Bạn muốn tìm quán ${subject} ở thành phố nào?` : `Which city should I look for ${subject} in?`, need: 'dest', links: [{ to: '/nearby', label: vi ? 'Tìm quanh vị trí của tôi' : 'Search near me' }] }
  const dishMatches = (p) => !dish || dishMatchStrength(p, dish) > 0
  const available = (list) => list.filter((p) => ['food', 'cafe'].includes(p.category ?? 'food') && p.googleRating != null && !excludeIds.includes(p.id) && dishMatches(p) && matchesFoodPreferences(p, preferences))
  let stored = []
  try { stored = available(placesForDestination(await catalog(), { cityId: trip.cityId, destinationName: where })) } catch { /* live lookup is still available */ }
  let found = null, unavailable = false
  if (stored.length < 3) {
    try {
      const origin = await locate(trip, where)
      if (origin) found = await search({ keyword, origin, area: where, radiusKm: 5, cityId: trip.cityId ?? null, pages: 1 })
      else unavailable = true
    } catch { unavailable = true }
  }
  // Apply the same dish evidence check to live candidates and the DB catalogue.
  const live = available(found?.places ?? []).filter((p) => !p.city || !trip.cityId || p.city === trip.cityId)
  const places = mergePlaceCatalog(stored, live).sort((a, b) => dishMatchStrength(b, dish) - dishMatchStrength(a, dish) || trusted(b) - trusted(a)).slice(0, 3)
  if (!places.length) return { preferences, text: [vi
    ? (excludeIds.length ? `Mình chưa tìm thêm được quán ${subject} khác ở ${where}. Bạn có muốn đổi món hoặc khu vực?`
      : unavailable ? `Mình chưa xác định được vị trí hoặc tải được dữ liệu quán tại ${where}. Bạn có thể thử lại hoặc tìm trong Khám phá.`
        : `Mình chưa tìm thấy quán ${subject} nào khớp tiêu chí và có đánh giá ở ${where}. Thử đổi món hoặc tìm trong Khám phá nhé.`)
    : `No ${excludeIds.length ? 'additional ' : ''}rated ${subject} places found in ${where}. Try a different dish or area.`, ...notes,
    vi ? 'Mình giữ nguyên các tiêu chí bạn yêu cầu. Bạn có thể giảm mức sao, đổi loại quán hoặc khu vực để tìm tiếp.' : 'Your filters are unchanged. Lower the rating threshold or change the venue type or area to continue.'].join('\n\n'), links: [{ to: '/explore', label: vi ? 'Khám phá' : 'Explore' }] }
  const lines = places.map((p, i) => `${i + 1}. ${p.name.vi} — ${p.googleRating}★ (${(p.googleRatingCount ?? 0).toLocaleString('vi-VN')})${p.address.vi ? ` · ${p.address.vi}` : ''}`)
  return {
    text: [vi ? `Mình tìm được ${places.length} quán ${subject} để bạn cân nhắc ở ${where}:` : `${places.length} ${subject} places to consider in ${where}:`, ...lines, ...notes,
      vi ? `Mình ưu tiên dữ liệu khớp món, rồi điểm Google có cân nhắc số lượt đánh giá.${stored.length ? ' Có sử dụng quán đã lưu trong FoodTrip.' : ''} Bạn muốn xem kỹ quán nào?` : 'Ranked by dish evidence, then Google ratings weighted by review count. Which place would you like to look at?'].join('\n'),
    places,
    preferences,
    links: [{ to: '/explore', label: vi ? 'Xem thêm trong Khám phá' : 'More in Explore' }],
  }
}

/**
 * Whether a message answers the question the assistant just asked back
 * (`pending.need`: 'dest' — "Bạn đi đâu?", 'place' — "Quán nào?") rather than
 * asking something new: "Đà Lạt" after "chi phí bao nhiêu?" is the destination,
 * "huỷ phòng có hoàn tiền không" is a new question.
 */
export function answersPending(pending, message, reading) {
  if (!pending) return false
  if (['greeting', 'thanks'].includes(reading.intent) || reading.faq) return false
  // A new, understood question wins over an outstanding clarification.
  // Naming a city in a food/weather question is not an answer to a planner prompt.
  if (reading.intent !== 'out_of_scope' && reading.intent !== pending.intent) return false
  // An explicit new dish is a new search, even while waiting for a city.
  // A bare city still completes the old dish request.
  if (pending.intent === 'find_food' && askedDish(message, reading.slots ?? [])) return false
  const words = message.trim().split(/\s+/).length
  if (pending.intent === 'plan_trip' && ['duration', 'people'].includes(pending.need)) {
    if (/^\d{1,2}$/.test(message.trim())) return true
    const fields = planFields(message, reading.slots ?? [])
    return words <= 12 && Boolean(pending.need === 'duration' ? fields.duration : fields.people)
  }
  if (pending.need === 'dest') {
    const fields = planFields(message, reading.slots ?? [])
    return Boolean((fields.cityId || fields.destinationQuery) && namesPlace(message, fields)) && words <= 12
  }
  if (pending.need === 'place') return words <= 10 && !/[?]$/.test(message.trim())
  return false
}
