import { getPlacesByCity, getCity, registerCustomPlaces } from '../data/destinations.js'
import { fetchPlaceEnrichment } from './placesService.js'
import { searchCityPlaces } from './citySearch.js'

// Generic day structure — the engine fills each slot with the best-scoring
// place of the right category for that city, rather than a fixed template.
const FULL_DAY_SLOTS = [
  { time: '07:00', noteKey: 'breakfast', categories: ['food'] },
  { time: '09:30', noteKey: 'sightseeing', categories: ['attraction'] },
  { time: '12:00', noteKey: 'lunch', categories: ['food'] },
  { time: '15:00', noteKey: 'experience', categories: ['attraction', 'cafe'] },
  { time: '19:00', noteKey: 'dinner', categories: ['food'] },
  // Nightlife/attractions vary a lot in whether they run late — if nothing
  // in the city is genuinely open by 21:00, better to end the day than
  // suggest a place that's actually closed by then.
  { time: '21:00', noteKey: 'evening', categories: ['cafe', 'attraction'], strict: true },
]

const LAST_DAY_SLOTS = [
  { time: '07:30', noteKey: 'breakfast2', categories: ['food', 'cafe'] },
  { time: '11:30', noteKey: 'lunch2', categories: ['food'] },
]

const NOTE_LABEL = {
  breakfast: { vi: 'Ăn sáng', en: 'Breakfast' },
  sightseeing: { vi: 'Tham quan', en: 'Sightseeing' },
  lunch: { vi: 'Ăn trưa', en: 'Lunch' },
  experience: { vi: 'Trải nghiệm', en: 'Experience' },
  dinner: { vi: 'Ăn tối', en: 'Dinner' },
  evening: { vi: 'Dạo tối', en: 'Evening' },
  breakfast2: { vi: 'Ăn sáng trước khi rời đi', en: 'Breakfast before check-out' },
  lunch2: { vi: 'Ăn trưa trước khi rời đi', en: 'Lunch before check-out' },
}

const TRANSPORT_SPEED_KMH = { walk: 4.5, bike: 25, car: 28, taxi: 28 }

function isOpenAt(hours, time) {
  const [h, m] = time.split(':').map(Number)
  const [oh, om] = hours.open.split(':').map(Number)
  const [ch, cm] = hours.close.split(':').map(Number)
  const t = h * 60 + m
  const openMin = oh * 60 + om
  const closeMin = ch * 60 + cm
  if (closeMin < openMin) return t >= openMin || t <= closeMin
  return t >= openMin && t <= closeMin
}

function haversineKm(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function formatDistance(km, transport) {
  if (km == null) {
    return { vi: 'Trong khu vực trung tâm', en: 'Within the city center' }
  }
  const speed = TRANSPORT_SPEED_KMH[transport] ?? 20
  const minutes = Math.max(1, Math.round((km / speed) * 60))
  const kmLabel = km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
  return { vi: `${kmLabel} · ${minutes} phút`, en: `${kmLabel} · ${minutes} min` }
}

// A single day asks for up to three food stops and two attraction/cafe stops,
// so a category with fewer than this many candidates cannot fill a day without
// sending the traveller somewhere twice.
const MIN_CANDIDATES_PER_CATEGORY = 4

/**
 * Tops the curated pool up with real places from the map provider when a
 * category is too thin to fill a day.
 *
 * The seed dataset only carries a handful of places per city — Hanoi has two
 * restaurants — so a multi-day plan built from it alone had to repeat the same
 * venue for lunch and dinner. Merging in live search results keeps every slot
 * distinct, and de-duplicates by name so a curated entry and its live twin
 * don't both appear.
 */
async function expandCandidates(cityId, seedPlaces) {
  const city = getCity(cityId)
  if (!city) return seedPlaces

  const counts = seedPlaces.reduce((acc, p) => ({ ...acc, [p.category]: (acc[p.category] ?? 0) + 1 }), {})
  const needsMore = ['food', 'cafe', 'attraction'].some((c) => (counts[c] ?? 0) < MIN_CANDIDATES_PER_CATEGORY)
  if (!needsMore) return seedPlaces

  const found = await searchCityPlaces(city.name.vi).catch(() => null)
  if (!found?.length) return seedPlaces

  const normalise = (s) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim()
  const seen = new Set(seedPlaces.map((p) => normalise(p.name.vi)))
  const extras = found.filter((p) => {
    const key = normalise(p.name.vi)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!extras.length) return seedPlaces

  // Make them resolvable by getPlace(), which the ticket and map render from.
  registerCustomPlaces(extras)
  return [...seedPlaces, ...extras]
}

// Weighted Sum Model criteria. Preference matters most (it's the whole point
// of a personalised itinerary); popularity is only a tiebreaker.
const WEIGHTS = { preference: 0.3, rating: 0.25, distance: 0.2, budget: 0.15, popularity: 0.1 }

// Distance score decays with travel from the previous stop: same spot scores 1,
// 1.5km scores 0.5, 5km scores ~0.23. Keeps a day's stops clustered instead of
// zig-zagging across town.
const DISTANCE_HALF_LIFE_KM = 1.5

/**
 * Scores a candidate place against the traveller's preferences, budget and how
 * far it is from the previous stop.
 *
 * Criteria with no data available are dropped and the remaining weights are
 * renormalised, so a missing signal never silently drags every candidate down
 * by a fixed amount. That matters because the map provider supplies no review
 * counts at all — scoring them as zero would waste the popularity weight on
 * every place equally, and there is no distance to measure for a day's first
 * stop either.
 */
function scorePlace(place, enrichment, prefs, budgetPerPersonPerDay, prevLocation) {
  const parts = []

  parts.push([WEIGHTS.preference, place.tags.some((t) => prefs.includes(t)) ? 1 : 0])

  const rating = enrichment?.rating ?? place.rating
  if (rating != null) parts.push([WEIGHTS.rating, Math.min(rating, 5) / 5])

  const location = enrichment?.location ?? place.location ?? null
  if (prevLocation && location) {
    const km = haversineKm(prevLocation, location)
    if (km != null) parts.push([WEIGHTS.distance, 1 / (1 + km / DISTANCE_HALF_LIFE_KM)])
  }

  const priceFit = place.price <= 1 || budgetPerPersonPerDay >= 600000
    ? 1
    : place.price === 2 && budgetPerPersonPerDay >= 300000
      ? 0.7
      : 0.4
  parts.push([WEIGHTS.budget, priceFit])

  const reviewCount = enrichment?.userRatingCount
  if (reviewCount != null) parts.push([WEIGHTS.popularity, Math.min(Math.log10(reviewCount + 1) / 4, 1)])

  const totalWeight = parts.reduce((sum, [w]) => sum + w, 0)
  return parts.reduce((sum, [w, value]) => sum + w * value, 0) / totalWeight
}

/**
 * Builds a day-by-day itinerary for a city by scoring every candidate place
 * (real Google rating + review count when a Maps API key is configured,
 * local seed rating otherwise) against the traveler's preferences, budget
 * and transport mode, then greedily fills each time slot with the best
 * unused match. Returns the same shape the static ITINERARY_TEMPLATES used
 * to have: an array of days, each an array of { time, placeId, note, distance }.
 *
 * `places` lets a caller supply a pre-fetched candidate pool (e.g. from
 * citySearch.js, for a destination outside the curated dataset) instead of
 * looking one up by `cityId`.
 *
 * Hotel suggestions are *not* handled here — the planner fetches those
 * up front (right after budget is entered, via hotelSearch.js) since it
 * doesn't need to wait for this function's generated stop locations.
 */
export async function generateItinerary({ cityId, places, duration, budget, people, prefs, transport }) {
  // A caller-supplied pool (custom destination) is already a full live search
  // result; only the curated per-city pools need topping up.
  const cityPlaces = places ?? (await expandCandidates(cityId, getPlacesByCity(cityId)))

  const enrichmentPairs = await Promise.all(
    cityPlaces.map(async (p) => {
      // Places already sourced live from Google (custom-city search) carry
      // their own rating/location — no need to look them up again.
      if (p.googlePlaceId) {
        return [p.id, { placeId: p.googlePlaceId, rating: p.liveRating, userRatingCount: p.liveReviewCount, location: p.location }]
      }
      try {
        const enrichment = await fetchPlaceEnrichment({ name: p.name.vi, address: p.address.vi, city: cityId })
        return [p.id, enrichment]
      } catch {
        return [p.id, null]
      }
    })
  )
  const enrichmentById = Object.fromEntries(enrichmentPairs)

  const budgetPerPersonPerDay = budget / Math.max(people, 1)
  // Tracks how many times each place has already been used rather than a
  // hard once-only Set — small cities/custom destinations often don't have
  // enough candidates to fill every slot of a long trip uniquely, so repeats
  // are allowed but heavily penalized, keeping variety whenever it exists.
  const usedCount = new Map()
  // Penalty per previous visit, applied to a 0–1 score: a place already seen
  // once needs to be far better than the alternatives to win again, and one
  // seen twice effectively drops out.
  const REPEAT_PENALTY = 0.5

  function pickForSlot(slot, prevLocation, usedToday) {
    const categoryMatches = cityPlaces.filter((p) => slot.categories.includes(p.category))
    // Prefer places actually open at this slot's time; only fall back to
    // closed ones if nothing in the city is open then (keeps a slot filled
    // rather than leaving it empty).
    const openAtTime = categoryMatches.filter((p) => isOpenAt(p.hours, slot.time))
    let candidates = openAtTime.length ? openAtTime : (slot.strict ? [] : categoryMatches)
    if (!candidates.length) return null

    // Never send the traveller to the same place twice in one day. When nothing
    // fresh is left, an optional slot (`strict`, e.g. the late-evening one) is
    // dropped rather than filled with somewhere they were hours earlier;
    // required slots like meals still fall back to a repeat.
    const notYetToday = candidates.filter((p) => !usedToday.has(p.id))
    if (notYetToday.length) candidates = notYetToday
    else if (slot.strict) return null

    const best = candidates
      .map((place) => ({
        place,
        score:
          scorePlace(place, enrichmentById[place.id], prefs, budgetPerPersonPerDay, prevLocation) -
          (usedCount.get(place.id) || 0) * REPEAT_PENALTY,
      }))
      .sort((a, b) => b.score - a.score)[0].place
    usedCount.set(best.id, (usedCount.get(best.id) || 0) + 1)
    return best
  }

  const days = []
  for (let d = 0; d < duration; d++) {
    const slots = duration > 1 && d === duration - 1 ? LAST_DAY_SLOTS : FULL_DAY_SLOTS
    const stops = []
    let prevLocation = null
    const usedToday = new Set()

    for (const slot of slots) {
      const place = pickForSlot(slot, prevLocation, usedToday)
      if (!place) continue
      usedToday.add(place.id)
      const enrichment = enrichmentById[place.id]
      const location = enrichment?.location ?? null
      const distanceKm = prevLocation && location ? haversineKm(prevLocation, location) : null

      stops.push({
        time: slot.time,
        placeId: place.id,
        note: NOTE_LABEL[slot.noteKey],
        distance: formatDistance(distanceKm, transport),
        liveRating: enrichment?.rating ?? null,
        liveReviewCount: enrichment?.userRatingCount ?? null,
        location,
        googlePlaceId: enrichment?.placeId ?? null,
      })
      if (location) prevLocation = location
    }
    days.push(stops)
  }

  return days
}
