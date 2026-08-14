import { hasMapsKey, searchPlaces, haversineKm } from './trackAsia.js'
import { getCity } from '../data/destinations.js'

const CACHE_PREFIX = 'ft_place_cache_v2:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7

// Track-Asia's geocoder always answers with its closest fuzzy match, even when
// that match is in a different province — searching a name it doesn't know
// happily returns something hundreds of kilometres away. Any hit further than
// this from the destination city is treated as "not found" rather than
// pinning a stop to the wrong side of the country.
const MAX_MATCH_DISTANCE_KM = 30

function cacheKey(query) {
  return CACHE_PREFIX + query.toLowerCase().trim()
}

function readCache(query) {
  try {
    const raw = localStorage.getItem(cacheKey(query))
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function writeCache(query, data) {
  try {
    localStorage.setItem(cacheKey(query), JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // storage unavailable/full — skip caching silently
  }
}

const cityCenters = new Map()

/** Geocodes a city once and remembers its centre, used to sanity-check place matches. */
async function getCityCenter(cityName) {
  if (cityCenters.has(cityName)) return cityCenters.get(cityName)
  const cached = readCache(`__city__${cityName}`)
  if (cached) {
    cityCenters.set(cityName, cached)
    return cached
  }
  const results = await searchPlaces(cityName, { limit: 1 })
  const center = results?.[0]?.location ?? null
  cityCenters.set(cityName, center)
  if (center) writeCache(`__city__${cityName}`, center)
  return center
}

/**
 * Looks a curated place up on Track-Asia to attach its real coordinates.
 *
 * Returns null when the place can't be confidently located — either nothing
 * matched, or the match landed outside the destination city (see
 * MAX_MATCH_DISTANCE_KM). Callers already handle a null enrichment by leaving
 * the stop without coordinates, which is far better than plotting it wrongly.
 *
 * Track-Asia carries no ratings or review counts (unlike the Google Places API
 * this replaced), so those come back null and the scoring engine falls back to
 * the curated seed rating.
 */
export async function fetchPlaceEnrichment({ name, address, city }) {
  if (!hasMapsKey) return null

  // `city` arrives as an internal id ("hoian"); the geocoder needs the real name.
  const cityName = getCity(city)?.name?.vi ?? city
  const query = `${name}, ${address}, ${cityName}`

  const cached = readCache(query)
  if (cached) return cached

  const [results, center] = await Promise.all([
    searchPlaces(query, { limit: 1 }),
    getCityCenter(cityName),
  ])
  const place = results && results[0]
  if (!place) return null

  if (center) {
    const distance = haversineKm(center, place.location)
    if (distance == null || distance > MAX_MATCH_DISTANCE_KM) return null
  }

  const enrichment = {
    placeId: place.id,
    rating: null,
    userRatingCount: null,
    location: place.location,
    mapsUri: null,
    reviews: [],
  }

  writeCache(query, enrichment)
  return enrichment
}
