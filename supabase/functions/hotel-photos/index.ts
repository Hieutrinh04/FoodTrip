import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { fetchHotelGallery, hasHotelbedsKeys } from '../_shared/hotelbeds.ts'
import { photoHostAllowed, photoMatchesHotel } from '../_shared/hotelMatch.ts'

/**
 * The photo gallery for one hotel's booking page.
 *
 * Kept out of `hotel-availability` on purpose: that endpoint answers for a
 * whole city and only needs one cover photo per hotel, while this one resolves
 * many angles plus per-room shots for the single hotel a traveller opened.
 * Doing both in one call would make every hotel list pay for photos nobody
 * scrolls to.
 *
 * Two sources, and they are not equivalent:
 *
 *   Hotelbeds  the property's own photographs, tagged with the room code they
 *              belong to. Authoritative — `source: "hotelbeds"`.
 *   Web        images published by booking sites that list this property, found
 *              through Serper. Only for hotels Hotelbeds does not carry (most
 *              homestays), filtered hard, and flagged `source: "web"` so the UI
 *              can say where they came from. No room-level photos: nothing in
 *              the result ties an image to a room type.
 */

// A hotel can list twenty room types; resolving photos for all of them would
// cost far more CDN round trips than the three or four shown on the page.
const MAX_ROOM_CODES = 6

const IMAGES_URL = 'https://google.serper.dev/images'
const MAX_WEB_PHOTOS = 8

// Below this a thumbnail is too small to fill a hero, and tiny results are
// usually icons or logos rather than photographs of the property.
const MIN_WEB_PHOTO_WIDTH = 400

type SerperImage = {
  title?: string
  imageUrl?: string
  imageWidth?: number
  link?: string
  source?: string
}

/**
 * Photographs of a property that only Google Maps knows about.
 *
 * Three gates, all required: the image must be hosted by a site that lists
 * hotels, every distinctive word of the hotel's name must appear in the result's
 * title or page URL, and it must be large enough to be a real photograph. A
 * booking page showing a stranger's building is worse than a booking page
 * showing one photo, so anything that cannot clear all three is dropped.
 */
async function webPhotos(name: string, cityName: string) {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey || !name) return []
  try {
    const response = await fetch(IMAGES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ q: `${name} ${cityName} khách sạn phòng`, gl: 'vn', hl: 'vi', num: 30 }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Serper images ${response.status}`)
    const json = await response.json() as { images?: SerperImage[] }

    const seen = new Set<string>()
    const kept: { url: string; title: string; link: string }[] = []
    for (const image of json.images ?? []) {
      const url = image.imageUrl
      if (!url || seen.has(url)) continue
      if (!photoHostAllowed(url)) continue
      if ((image.imageWidth ?? 0) < MIN_WEB_PHOTO_WIDTH) continue
      if (!photoMatchesHotel(`${image.title ?? ''} ${image.link ?? ''}`, name, cityName)) continue
      seen.add(url)
      kept.push({ url, title: image.title ?? '', link: image.link ?? '' })
      if (kept.length >= MAX_WEB_PHOTOS) break
    }
    return kept
  } catch (error) {
    console.error('web hotel photos failed:', (error as Error).message)
    return []
  }
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

  const code = Number(body.hotelbedsCode)
  const name = String(body.name ?? '').trim()
  const cityName = String(body.cityName ?? '').trim()

  // A Hotelbeds property always uses its own photographs — they are the real
  // ones, and they carry room codes the web results never could.
  if (hasHotelbedsKeys() && Number.isFinite(code) && code > 0) {
    const roomCodes = Array.isArray(body.roomCodes)
      ? body.roomCodes.map((value) => String(value)).filter(Boolean).slice(0, MAX_ROOM_CODES)
      : []
    const gallery = await fetchHotelGallery(code, roomCodes)
    if (gallery.general.length || Object.keys(gallery.rooms).length) {
      return jsonResponse({ status: 'ok', source: 'hotelbeds', ...gallery })
    }
  }

  if (!name) return jsonResponse({ error: 'missing-hotel' }, { status: 400 })

  const found = await webPhotos(name, cityName)
  return jsonResponse({
    status: 'ok',
    source: found.length ? 'web' : 'none',
    general: found.map((photo) => photo.url),
    rooms: {},
    // Where each photo came from, so a wrong-hotel match can be spotted from
    // the response rather than only by eye on the page.
    sources: found.map((photo) => ({ title: photo.title, link: photo.link })),
  })
})
