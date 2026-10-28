import { normalise as toMapPlace } from './mapAreaSearch.js'
import { recomputeDistances } from './itineraryEdit.js'
import { cacheCustomPlaces } from './customPlacesCache.js'
import { saveItinerary } from './itineraries.js'
import { fetchPlaceDetails } from './placeDetails.js'
import { CITIES, registerCustomPlaces } from '../data/destinations.js'

// A video that is someone's itinerary (detect-place's `plan`: days of
// { said, placeId, time, slot }) → a FoodTrip trip like theirs, in the same
// shape the planner saves, so /trips, sharing, export and live trips all work
// on it. Only the stops the person kept are used, each at the venue they
// confirmed; the venues are stored as custom places so the trip still opens
// after a reload or on another device.

const NOTE = {
  breakfast: { vi: 'Ăn sáng', en: 'Breakfast' },
  sightseeing: { vi: 'Tham quan', en: 'Sightseeing' },
  lunch: { vi: 'Ăn trưa', en: 'Lunch' },
  experience: { vi: 'Trải nghiệm', en: 'Experience' },
  cafe: { vi: 'Cà phê', en: 'Coffee' },
  dinner: { vi: 'Ăn tối', en: 'Dinner' },
  evening: { vi: 'Dạo tối', en: 'Evening' },
}

const FOOD = /nhà hàng|quán|ăn|món|bún|phở|cơm|bánh|lẩu|nướng|hải sản|chè|xôi|ốc|restaurant|food|bakery|eatery|bistro|buffet|bbq|kitchen|grill|seafood/i
const CAFE = /cà phê|cafe|café|coffee|trà sữa|tiệm trà|tea|pub|bar\b/i

/**
 * Food, café or sight, from Google's category ("Lagoon", "Điểm thu hút khách
 * du lịch" are sights; the map search's own guess calls anything unknown food).
 * Without a category — venues FoodTrip knew already — from the name.
 */
function kindOf(found) {
  const category = found.category ?? ''
  if (CAFE.test(category) || (!category && CAFE.test(found.name))) return 'cafe'
  if (!category || FOOD.test(category)) return 'food'
  return 'attraction'
}

/** What a stop is for: its time of day, and whether the venue is a sight or a café. */
function noteFor(slot, category) {
  if (category === 'attraction') return NOTE[slot === 'evening' || slot === 'dinner' ? 'evening' : 'sightseeing']
  if (category === 'cafe' && slot !== 'breakfast') return NOTE.cafe
  return NOTE[slot] ?? NOTE.experience
}

/** The key a plan stop is kept or left out by. */
export const stopKey = (dayIndex, stop) => `${dayIndex}:${stop.time}:${stop.placeId ?? stop.said}`

/**
 * @param plan       detect-place's plan
 * @param places     the suggestions it came with (shapePlace + placeId)
 * @param keep       Set of stopKey()s the person kept
 * @returns { days, places } — days without a kept stop are left out
 */
export function draftFromVideo({ plan, places, keep, transport = 'bike' }) {
  const byId = new Map(places.map((p) => [p.placeId, p]))
  const used = new Map()
  const days = plan.days
    .map((day, d) => day
      .filter((stop) => stop.placeId && byId.has(stop.placeId) && keep.has(stopKey(d, stop)))
      .map((stop) => {
        const found = byId.get(stop.placeId)
        const place = used.get(stop.placeId) ?? { ...toMapPlace(found), category: kindOf(found) }
        used.set(stop.placeId, place)
        return {
          time: stop.time, placeId: place.id, note: noteFor(stop.slot, place.category),
          location: place.location, googlePlaceId: found.placeId,
          liveRating: found.rating ?? null, liveReviewCount: found.ratingCount ?? null,
        }
      }))
    .filter((day) => day.length)
    .map((day) => recomputeDistances(day, transport))
  return { days, places: [...used.values()] }
}

/**
 * Google's details (hours, rating, category) for the plan's venues that came
 * without them — venues FoodTrip knew only by name. place-details answers from
 * stored venues for free and stores what it has to look up, so this is paid
 * once per venue, ever. A venue that cannot be looked up is kept as it is.
 */
export async function withDetails(places, placeIds) {
  return Promise.all(places.map(async (p) => {
    if (!placeIds.has(p.placeId) || (p.hours?.length && p.rating != null)) return p
    try {
      const { status, place } = await fetchPlaceDetails({ name: p.name, address: p.address ?? '', location: p.location })
      if (status !== 'ok' || !place) return p
      const pick = (key) => p[key] ?? place[key] ?? null
      return { ...p, category: pick('category'), rating: pick('rating'), ratingCount: pick('ratingCount'), hours: p.hours?.length ? p.hours : place.hours ?? null, priceLevel: pick('priceLevel'), thumbnailUrl: pick('thumbnailUrl'), mapsUrl: pick('mapsUrl'), phone: pick('phone'), website: pick('website') }
    } catch { return p }
  }))
}

/** Saves the drafted trip for the signed-in person; resolves to the new trip's id. */
export async function saveVideoPlan({ userId, draft, cityName, people, budget, transport }) {
  registerCustomPlaces(draft.places)
  await cacheCustomPlaces(draft.places)
  const city = CITIES.find((c) => c.name.vi === cityName)
  return saveItinerary({
    userId, cityId: city?.id ?? null, customCityName: city ? null : (cityName || 'Lịch trình từ video'),
    duration: draft.days.length, startDate: null, budget, people, transport, prefs: [], days: draft.days, hotels: [],
  })
}
