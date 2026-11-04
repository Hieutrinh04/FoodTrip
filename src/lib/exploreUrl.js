// Explore's view as a link: the city, the search, the filters and the place
// open, in the query string, so the address bar always shares what is on screen.

/** The query string for an Explore view; defaults are left out. */
export function exploreParams({ city = 'all', q = '', category = 'all', food = 'all', place = null }) {
  const params = new URLSearchParams()
  if (city && city !== 'all') params.set('city', city)
  if (q?.trim()) params.set('q', q.trim())
  if (category && category !== 'all') params.set('category', category)
  if (food && food !== 'all') params.set('food', food)
  if (place) params.set('place', place)
  return params
}
