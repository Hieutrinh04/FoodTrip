import { shapePlace, type SerperPlace } from './serperPlace.ts'

export async function sharePlaceSearch(query: string) {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) throw new Error('search-unavailable')
  const response = await fetch('https://google.serper.dev/maps', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 8 }),
  })
  if (!response.ok) throw new Error('search-failed')
  const body = await response.json()
  return (body.places || []).slice(0, 8).map((raw: SerperPlace) => {
    const place = shapePlace(raw)
    return { ...place, placeId: place.placeId || `map:${place.location?.lat},${place.location?.lng}:${place.name}` }
  }).filter((p: ReturnType<typeof shapePlace>) => p.name && p.address && p.location &&
    Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng) && Math.abs(p.location.lat) <= 90 && Math.abs(p.location.lng) <= 180)
}
