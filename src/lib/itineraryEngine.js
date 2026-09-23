import { getPlacesByCity, getCity, registerCustomPlaces } from '../data/destinations.js'
import { fetchPlaceEnrichment } from './placesService.js'
import { searchCityPlaces } from './citySearch.js'
import { optimiseDayRouteByRoad } from './routeOptimizer.js'
import { scorePlace as scoreByModel } from './placeScore.js'
import { fetchRouteDetails } from './trackAsia.js'

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

function formatDistance(km, transport, durationSeconds = null) {
  if (km == null) {
    return { vi: 'Trong khu vực trung tâm', en: 'Within the city center' }
  }
  const speed = TRANSPORT_SPEED_KMH[transport] ?? 20
  const minutes = Math.max(1, Math.round(durationSeconds == null ? (km / speed) * 60 : durationSeconds / 60))
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

// Scoring lives in placeScore.js so the explore map ranks places by exactly
// the same Weighted Sum Model this generator uses.
function scorePlace(place, enrichment, prefs, budgetPerPersonPerDay, prevLocation) {
  return scoreByModel(place, {
    prefs,
    budgetPerPersonPerDay,
    referenceLocation: prevLocation,
    rating: enrichment?.rating ?? place.rating,
    reviewCount: enrichment?.userRatingCount,
    location: enrichment?.location ?? place.location,
  }) ?? 0
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
// `people` is deliberately not read: the budget is already per person, and the
// scoring model compares it against per-person place prices, so party size does
// not enter the calculation. Callers still pass it; it is ignored here.
export async function generateItinerary({ cityId, places, duration, budget, prefs, transport, startLocation = null, endLocation = null }) {
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

  // The slider gives one traveller's budget for the whole trip, so a daily
  // allowance is that spread across the days. It used to be divided by the
  // party size instead, which scaled a 1.500.000đ budget down to 750.000đ for
  // two people and made the model pick cheaper places the larger the group got
  // — party size does not belong in this figure at all, since the budget is
  // already per person and place prices are scored per person too.
  const budgetPerPersonPerDay = budget / Math.max(duration, 1)
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
    const entries = []
    let prevLocation = null
    const usedToday = new Set()

    // Pass 1 — fill each slot greedily, best-scoring place first.
    for (const slot of slots) {
      const place = pickForSlot(slot, prevLocation, usedToday)
      if (!place) continue
      usedToday.add(place.id)
      const enrichment = enrichmentById[place.id]
      // Curated places already carry verified coordinates. Preserve those when
      // live enrichment is unavailable so one missing provider lookup cannot
      // disable road optimisation for the entire day.
      const location = enrichment?.location ?? place.location ?? null
      entries.push({ slot, place, location, enrichment })
      if (location) prevLocation = location
    }

    // Pass 2 — the greedy fill commits to each slot without looking ahead, so
    // an early pick can strand a later stop across town. Reorder which place
    // sits in which slot to cut total travel, keeping every place in a slot it
    // is still valid for.
    // Keep the routing budget bounded across long trips while still evaluating
    // every common day against several schedule-valid alternatives.
    const routeCandidateLimit = Math.max(6, Math.min(24, Math.floor(96 / Math.max(duration, 1))))
    const routeResult = await optimiseDayRouteByRoad(entries, isOpenAt, {
      startLocation,
      endLocation,
      candidateLimit: routeCandidateLimit,
      fetchRouteDetails: (points) => fetchRouteDetails(points, transport, { geometry: false }),
    })
    const optimised = routeResult.entries

    // Distances are between consecutive stops, so they can only be computed
    // once the final order is settled.
    const stops = []
    let previous = startLocation
    for (let stopIndex = 0; stopIndex < optimised.length; stopIndex += 1) {
      const { slot, place, location, enrichment } = optimised[stopIndex]
      const roadLegIndex = startLocation ? stopIndex : stopIndex - 1
      const roadLeg = roadLegIndex >= 0 ? routeResult.routeDetails?.legs?.[roadLegIndex] : null
      const straightLineKm = previous && location ? haversineKm(previous, location) : null
      const distanceKm = roadLeg?.distanceMeters != null ? roadLeg.distanceMeters / 1000 : straightLineKm
      stops.push({
        time: slot.time,
        placeId: place.id,
        note: NOTE_LABEL[slot.noteKey],
        distance: formatDistance(distanceKm, transport, roadLeg?.durationSeconds),
        travel: distanceKm == null ? null : {
          distanceMeters: Math.round(distanceKm * 1000),
          durationSeconds: roadLeg?.durationSeconds ?? Math.round((distanceKm / (TRANSPORT_SPEED_KMH[transport] ?? 20)) * 3600),
          source: roadLeg ? 'road' : 'estimate',
        },
        liveRating: enrichment?.rating ?? null,
        liveReviewCount: enrichment?.userRatingCount ?? null,
        location,
        googlePlaceId: enrichment?.placeId ?? null,
      })
      if (location) previous = location
    }
    if (endLocation && stops.length) {
      const returnLegIndex = startLocation ? optimised.length : optimised.length - 1
      const returnLeg = routeResult.routeDetails?.legs?.[returnLegIndex]
      const returnKm = returnLeg?.distanceMeters != null
        ? returnLeg.distanceMeters / 1000
        : haversineKm(previous, endLocation)
      if (returnKm != null) {
        stops[stops.length - 1].returnTravel = {
          distanceMeters: Math.round(returnKm * 1000),
          durationSeconds: returnLeg?.durationSeconds ?? Math.round((returnKm / (TRANSPORT_SPEED_KMH[transport] ?? 20)) * 3600),
          source: returnLeg ? 'road' : 'estimate',
        }
      }
    }
    days.push(stops)
  }

  return days
}
