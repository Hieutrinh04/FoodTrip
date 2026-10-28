// Whether a basemap search result is the kind of place the explore page looks
// for. The basemap provider's search is plain text: asking for "quán ăn Phú
// Lợi" also returns the ward itself, a building contractor and a phone shop
// whose names happen to match. Its results carry types, so they are kept only
// when a type says they are somewhere to eat, drink or visit.

const FOOD_TYPES = new Set([
  'restaurant', 'food', 'food_and_drink', 'cafe', 'coffee_shop', 'bakery', 'bar', 'pub',
  'meal_takeaway', 'meal_delivery', 'bubble_tea_store', 'ice_cream_shop', 'dessert_shop',
  'fast_food_restaurant', 'night_club', 'tea_house', 'juice_shop', 'food_court',
])

const ATTRACTION_TYPES = new Set([
  'tourist_attraction', 'museum', 'park', 'amusement_park', 'zoo', 'aquarium', 'art_gallery',
  'place_of_worship', 'church', 'hindu_temple', 'buddhist_temple', 'pagoda', 'natural_feature',
  'campground', 'landmark', 'historical_site', 'beach', 'market',
])

// With no types at all, a name that says what it is still counts.
const FOOD_WORDS = ['quán', 'nhà hàng', 'cà phê', 'cafe', 'coffee', 'phở', 'bún', 'cơm', 'lẩu', 'bánh', 'trà', 'chè', 'ốc', 'nướng', 'buffet', 'restaurant']

/**
 * @param types     the provider's types for the result (may be empty)
 * @param name      the result's name
 * @param category  'all' | 'food' | 'cafe' | 'attraction'
 */
export function isWantedPlace(types, name, category = 'all') {
  const list = types ?? []
  if (category === 'attraction') return list.some((type) => ATTRACTION_TYPES.has(type))
  if (list.some((type) => FOOD_TYPES.has(type))) return true
  if (list.length) return false
  const lower = String(name ?? '').toLowerCase()
  return FOOD_WORDS.some((word) => lower.includes(word))
}
