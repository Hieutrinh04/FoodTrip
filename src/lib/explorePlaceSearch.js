import { searchNearbyByCoords, searchPlaces } from './trackAsia.js'

const KEYWORDS = {
  pho: 'quán phở', coffee: 'quán cà phê', seafood: 'quán hải sản',
  noodles: 'quán bún mì', rice: 'quán cơm', hotpot: 'quán lẩu nướng',
  snacks: 'quán ăn vặt', vegetarian: 'quán chay',
}

function stableRating(id = '') {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  return 3.9 + (hash % 9) / 10
}

function normalizePlace(result, { foodType, cityId }) {
  const rawId = result.id || `${result.name}-${result.address}`
  const id = `live-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90)}`
  return {
    id, source: 'track-asia', city: cityId || null,
    category: foodType === 'coffee' ? 'cafe' : 'food',
    name: { vi: result.name, en: result.name },
    address: { vi: result.address, en: result.address },
    shortDesc: { vi: `Địa điểm ${KEYWORDS[foodType]} từ dữ liệu bản đồ`, en: `A ${foodType} place from live map data` },
    location: result.location, distanceKm: result.distanceKm ?? null,
    tags: [foodType], price: 1, rating: stableRating(id),
    hours: { open: '06:00', close: '23:00' }, reviews: [],
  }
}

export async function searchExplorePlaces({ foodType, city, origin, radiusKm = 5 }) {
  if (!KEYWORDS[foodType]) return []
  const keyword = KEYWORDS[foodType]
  const results = origin
    ? await searchNearbyByCoords(origin, { keyword, radiusKm, limit: 30 })
    : await searchPlaces(`${keyword} ${city?.name?.vi || ''}`, { limit: 30 })
  return (results || []).map((result) => normalizePlace(result, { foodType, cityId: city?.id }))
}
