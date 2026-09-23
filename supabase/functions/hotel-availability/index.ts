import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { callSerperMaps, shapePlace } from '../_shared/serperPlace.ts'
import { findGoogleTwin } from '../_shared/hotelMatch.ts'
import { cityGeo, eurToVnd, fetchCityAvailability, fetchHotelPhotos, hasHotelbedsKeys, shapeHotel } from '../_shared/hotelbeds.ts'

/**
 * The hotel list behind the planner's accommodation step, merged from the two
 * sources that each hold half the picture:
 *
 *   Hotelbeds  real nightly rate, real room types, board, free-cancellation
 *              deadline and remaining inventory — but no photo and no rating.
 *   Serper     Google Maps' photo, star rating and review count — but no
 *              bookable price.
 *
 * Neither is a superset of the other, so the response is their union: hotels
 * that exist in both carry everything, and the rest are returned with whatever
 * is genuinely known about them. `priceSource` tells the client which it is
 * looking at, so the UI never presents an estimate as a real tariff.
 *
 * Both halves are optional. With no keys at all the client falls back to
 * Track-Asia, exactly as before this endpoint existed.
 */

const MAX_HOTELS = 24

// Serper bills 3 credits per page and, in testing, asking for a second page
// returned fewer usable hotels rather than more (its outlier filter re-centres
// on the wider spread), so only the first page is requested.
const SERPER_PAGE = 1
const SERPER_RESULTS = 20

function isoDate(value: unknown, fallbackDaysFromNow: number) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Date(Date.now() + fallbackDaysFromNow * 86400000).toISOString().slice(0, 10)
}

function dedupe(places: ReturnType<typeof shapePlace>[]) {
  // The same property can come back under two ids, which would otherwise put
  // one hotel on the list twice.
  const seen = new Set<string>()
  return places.filter((place) => {
    if (!place.location || !place.name) return false
    const key = place.placeId ?? `${place.name}@${place.location.lat.toFixed(5)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Hotelbeds' Vietnamese inventory is almost entirely hotels and resorts, so
// asking Google only for "khách sạn" left the cheap end of the list empty —
// homestays are where a modest budget actually gets a room in Hội An or Sa Pa.
// They have to be two separate searches: "khách sạn homestay ở Hội An" as one
// query returned four results, all homestays, because Google matched the
// literal word and dropped every hotel.
const ACCOMMODATION_QUERIES = ['khách sạn ở', 'homestay ở']

async function googleHotels(cityName: string) {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) return []
  const base = { gl: 'vn', hl: 'vi', page: SERPER_PAGE, num: SERPER_RESULTS }

  const responses = await Promise.all(
    ACCOMMODATION_QUERIES.map((prefix) =>
      callSerperMaps(apiKey, { q: `${prefix} ${cityName}`, ...base }).catch(() => ({ places: [] })),
    ),
  )
  const places = dedupe(responses.flatMap((response) => response.places ?? []).map(shapePlace))
  if (places.length) return places

  // A plain city query comes back empty for some cities and full for others —
  // "khách sạn ở Sa Pa" returned 20 results in the same minute that "khách sạn
  // ở Hội An" returned none. Re-asking around the city's own centre recovers
  // those. The centre is curated rather than geocoded, so this does not
  // reintroduce the geocoding drift that made map-place-search prefer a bare
  // text query for whole cities.
  const geo = cityGeo(cityName)
  if (!geo) return places
  const retry = await callSerperMaps(apiKey, {
    q: 'khách sạn homestay',
    ll: `@${geo.lat},${geo.lng},13z`,
    ...base,
  })
  return dedupe((retry.places ?? []).map(shapePlace))
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'invalid-body' }, { status: 400 })
  }

  const cityName = String(body.cityName ?? '').trim()
  if (!cityName) return jsonResponse({ error: 'missing-city' }, { status: 400 })

  const checkIn = isoDate(body.checkIn, 30)
  const checkOut = isoDate(body.checkOut, 31)
  const adults = Math.min(Math.max(Number(body.adults) || 2, 1), 8)
  const roomCount = Math.min(Math.max(Number(body.rooms) || 1, 1), 4)

  const wantsHotelbeds = hasHotelbedsKeys()
  if (!wantsHotelbeds && !Deno.env.get('SERPER_API_KEY')) {
    return jsonResponse({ status: 'no-key', hotels: [] })
  }

  // One source failing must not take the other down with it: a Hotelbeds outage
  // should still leave the traveller a list of real hotels with photos. Each
  // half's outcome is reported back rather than swallowed, so an expired key
  // never reads as "this city has no hotels".
  const problems: string[] = []
  const [availability, places] = await Promise.all([
    wantsHotelbeds
      ? fetchCityAvailability({ cityName, checkIn, checkOut, adults, rooms: roomCount }).catch((err) => {
          console.error('hotelbeds availability failed:', (err as Error).message)
          problems.push(`hotelbeds: ${(err as Error).message}`)
          return { hotels: [], unsupportedCity: false }
        })
      : Promise.resolve({ hotels: [], unsupportedCity: false }),
    googleHotels(cityName).catch((err) => {
      console.error('serper hotel search failed:', (err as Error).message)
      problems.push(`serper: ${(err as Error).message}`)
      return []
    }),
  ])

  const { rate, live } = await eurToVnd()

  // Hotels Hotelbeds can actually price, richest first.
  const priced = availability.hotels
    .map((hotel) => shapeHotel(hotel, rate))
    .filter((hotel) => hotel.priceFrom != null)

  const usedPlaces = new Set<string>()
  const merged = priced.map((hotel) => {
    const twin = findGoogleTwin(hotel, places, cityName)
    if (twin?.name) usedPlaces.add(twin.name)
    return {
      ...hotel,
      priceSource: 'hotelbeds' as const,
      rating: twin?.rating ?? null,
      userRatingCount: twin?.ratingCount ?? null,
      photoUrl: twin?.thumbnailUrl ?? null,
      address: twin?.address ?? hotel.area,
      mapsUri: twin?.mapsUrl ?? null,
      googlePlaceId: twin?.placeId ?? null,
    }
  })

  // Google hotels with no Hotelbeds counterpart still belong in the list: in
  // the thinner cities Hotelbeds carries four properties and Google twenty.
  // They arrive without a price and the client estimates one, clearly labelled.
  for (const place of places) {
    if (!place.name || usedPlaces.has(place.name)) continue
    merged.push({
      id: place.placeId ? `g-${place.placeId}` : `g-${place.name}`,
      hotelbedsCode: null,
      name: place.name,
      stars: null,
      area: null,
      location: place.location,
      rooms: [],
      priceFrom: null,
      priceSource: 'estimated' as const,
      rating: place.rating,
      userRatingCount: place.ratingCount,
      photoUrl: place.thumbnailUrl,
      address: place.address,
      mapsUri: place.mapsUrl,
      googlePlaceId: place.placeId,
    })
  }

  // A real price outranks an estimate; within each, a photo and a rating make a
  // card usable, and a better-reviewed hotel is the more useful suggestion.
  merged.sort((a, b) => {
    const priceRank = Number(b.priceSource === 'hotelbeds') - Number(a.priceSource === 'hotelbeds')
    if (priceRank) return priceRank
    const photoRank = Number(Boolean(b.photoUrl)) - Number(Boolean(a.photoUrl))
    if (photoRank) return photoRank
    return (b.rating ?? 0) - (a.rating ?? 0)
  })

  const shown = merged.slice(0, MAX_HOTELS)

  // Only a minority of Hotelbeds hotels find a Google twin, so most cards had
  // no photo at all. Hotelbeds publishes its own photos through a separate
  // content endpoint on the same key — one extra call fills in the rest.
  // Asked for after the slice, so it only ever covers hotels being returned.
  const needPhotos = shown
    .filter((hotel) => !hotel.photoUrl && hotel.hotelbedsCode != null)
    .map((hotel) => hotel.hotelbedsCode as number)
  if (needPhotos.length) {
    const photos = await fetchHotelPhotos(needPhotos)
    for (const hotel of shown) {
      if (hotel.photoUrl || hotel.hotelbedsCode == null) continue
      hotel.photoUrl = photos.get(hotel.hotelbedsCode) ?? null
    }
  }

  return jsonResponse({
    status: 'ok',
    currency: 'VND',
    stay: { checkIn, checkOut, adults, rooms: roomCount },
    fx: { eurToVnd: rate, live },
    counts: {
      hotelbeds: priced.length,
      google: places.length,
      enriched: merged.filter((h) => h.priceSource === 'hotelbeds' && h.photoUrl).length,
      withPhoto: shown.filter((h) => h.photoUrl).length,
      shown: shown.length,
    },
    unsupportedCity: availability.unsupportedCity,
    problems,
    hotels: shown,
  })
})
