import { jsonResponse, handleOptions } from '../_shared/cors.ts'

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

async function verifyPlace(query: string) {
  const apiKey = Deno.env.get('GOOGLE_PLACES_SERVER_KEY')
  if (!apiKey) return { status: 'no-key' }

  const response = await fetch(PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({ textQuery: `${query}, Vietnam`, languageCode: 'vi', maxResultCount: 1 }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Places API ${response.status}: ${text.slice(0, 200)}`)
  }

  const json = await response.json()
  const place = json.places?.[0]
  if (!place) return { status: 'no-match' }

  return {
    status: 'matched',
    placeId: place.id,
    name: place.displayName?.text ?? query,
    address: place.formattedAddress ?? null,
    location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { query } = await req.json()
    if (!query) return jsonResponse({ error: 'missing-query' }, { status: 400 })
    const place = await verifyPlace(query)
    return jsonResponse(place)
  } catch (err) {
    console.error('verify-place failed:', (err as Error).message)
    return jsonResponse({ error: 'verify-failed', message: (err as Error).message }, { status: 502 })
  }
})
