import { normalizeVi } from './text.js'

// ---------------------------------------------------------------------------
// Tours inside the trip planner. A departure is offered when it runs in the
// trip's destination on one of the trip's days; the itinerary then leaves the
// tour's hours free rather than booking a lunch in the middle of it.

const HOUR = 3600000
const VN_OFFSET = 7 * HOUR
const vnIso = (iso) => new Date(new Date(iso).getTime() + VN_OFFSET).toISOString()
/** "2026-10-02" — the departure's calendar day in Vietnam. */
export const vnDate = (iso) => vnIso(iso).slice(0, 10)
/** "08:30" — the departure's clock time in Vietnam. */
export const vnTime = (iso) => vnIso(iso).slice(11, 16)

// Other names the same city goes by in a partner's "destination" field.
const CITY_ALIASES = {
  hcmc: ['ho chi minh', 'sai gon', 'saigon', 'hcm'],
  hanoi: ['ha noi', 'hanoi'],
  danang: ['da nang', 'danang'],
  hoian: ['hoi an', 'hoian'],
  dalat: ['da lat', 'dalat'],
  phuquoc: ['phu quoc'],
  nhatrang: ['nha trang'],
  sapa: ['sa pa', 'sapa'],
}

/** The words a tour's destination may use for this city. */
export function destinationNames(city, cityId) {
  const names = [city?.name?.vi, city?.name?.en, ...(CITY_ALIASES[cityId] ?? [])]
    .map((name) => normalizeVi(name).replace(/^(tp|thanh pho|tinh)\s+/, ''))
  return [...new Set(names.filter((name) => name.length >= 2))]
}

function inDestination(row, names) {
  const text = ` ${normalizeVi(`${row.destination} ${row.title}`)} `
  return names.some((name) => text.includes(` ${name} `))
}

function dayOffset(date, startDate) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / (24 * HOUR))
}

/** Which trip days (0-based) a departure covers, from its first to its last. */
export function tourDays(row, startDate) {
  return { first: dayOffset(vnDate(row.starts_at), startDate), last: dayOffset(vnDate(row.ends_at), startDate) }
}

/**
 * Open departures for this trip, split into those that fit its dates and
 * those in the same place on other dates (so the traveller can see a date
 * change would open one up).
 */
export function toursForTrip(rows, { names, startDate, duration }) {
  const here = (rows ?? []).filter((row) => inDestination(row, names))
  const fits = (row) => {
    const { first, last } = tourDays(row, startDate)
    return first >= 0 && last < duration
  }
  return { onTrip: here.filter(fits), otherDates: here.filter((row) => !fits(row)) }
}

/** Whether two departures overlap in time — the traveller cannot be on both. */
export function toursOverlap(a, b) {
  return Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at)
}

const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

/**
 * The itinerary with every stop that falls in a chosen tour's hours taken out.
 * A stop is counted from 45 minutes before its slot, so breakfast at 07:30 is
 * kept for an 08:30 pick-up but not for an 08:00 one.
 */
export function clearTourHours(days, tours, startDate) {
  if (!tours?.length || !startDate) return days
  return days.map((day, dayIndex) => day.filter((stop) => {
    if (!stop.time) return true
    const at = minutesOf(stop.time)
    return !tours.some((tour) => {
      const { first, last } = tourDays(tour, startDate)
      if (dayIndex < first || dayIndex > last) return false
      const from = dayIndex === first ? minutesOf(vnTime(tour.starts_at)) : 0
      const to = dayIndex === last ? minutesOf(vnTime(tour.ends_at)) : 24 * 60
      return at + 45 > from && at < to
    })
  }))
}

/** What the itinerary keeps of a departure — enough to show and to reserve it later. */
export function tourForItinerary(row) {
  const { id, tour_id, title, destination, operator_name, meeting_point, starts_at, ends_at, price, cover_url } = row
  return { id, tour_id, title, destination, operator_name, meeting_point, starts_at, ends_at, price: Number(price), cover_url: cover_url ?? null }
}

/** "2 ngày 1 đêm", "4 giờ" — how long a departure lasts, as a tour page says it. */
export function tourDurationLabel(row, lang = 'vi') {
  const hours = (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / HOUR
  const days = Math.round((Date.parse(`${vnDate(row.ends_at)}T00:00:00Z`) - Date.parse(`${vnDate(row.starts_at)}T00:00:00Z`)) / (24 * HOUR))
  if (days === 0) {
    const h = Math.round(hours * 2) / 2
    return lang === 'vi' ? `${h} giờ` : `${h} hours`
  }
  return lang === 'vi' ? `${days + 1} ngày ${days} đêm` : `${days + 1}D${days}N`
}

/** Per-person trip budget left once the chosen tours are paid for. */
export function budgetAfterTours(budgetPerPerson, tours) {
  const spent = (tours ?? []).reduce((sum, tour) => sum + Number(tour.price || 0), 0)
  return Math.max(0, (budgetPerPerson || 0) - spent)
}
