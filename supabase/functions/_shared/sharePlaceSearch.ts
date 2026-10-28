import { shapePlace, type SerperPlace } from './serperPlace.ts'
import { hasSerperKey, serperFetch } from './serper.ts'

export async function sharePlaceSearch(query: string) {
  if (!hasSerperKey()) throw new Error('search-unavailable')
  const response = await serperFetch('maps', { q: query, gl: 'vn', hl: 'vi', num: 8 }, 10000)
  if (!response.ok) throw new Error('search-failed')
  const body = await response.json()
  return (body.places || []).slice(0, 8).map((raw: SerperPlace) => {
    const place = shapePlace(raw)
    return { ...place, placeId: place.placeId || `map:${place.location?.lat},${place.location?.lng}:${place.name}` }
  }).filter((p: ReturnType<typeof shapePlace>) => p.name && p.address && p.location &&
    Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng) && Math.abs(p.location.lat) <= 90 && Math.abs(p.location.lng) <= 180)
}
