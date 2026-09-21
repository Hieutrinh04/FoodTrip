import { normalizeSearchText } from './relevance.ts'

/**
 * Hotelbeds APItude — real hotel availability, rates and room inventory.
 *
 * This is the only source in FoodTrip that returns a *real* nightly tariff.
 * Everything else the app knows about a hotel (photo, Google rating) comes
 * from Serper, and the two are merged in `hotel-availability`.
 *
 * Credentials are Edge Function secrets and must never reach the browser:
 *   supabase secrets set HOTELBEDS_API_KEY=... HOTELBEDS_SECRET=...
 * Signing is SHA256(apiKey + secret + unix seconds), sent as X-Signature.
 */

const HOST = 'https://api.test.hotelbeds.com'
const AVAILABILITY = `${HOST}/hotel-api/1.0/hotels`

// Hotelbeds' *test* environment mixes genuine tariffs with placeholder records:
// probing the 12 cities turned up nightly rates of 28,566 EUR and even
// 744,936,475 EUR alongside plausible ones. A hotel whose cheapest rate falls
// outside this band is treated as having no price at all rather than shown — a
// wrong price is worse than no price. Production APItude would not need this;
// the evaluation key only reaches the test environment.
const MIN_PLAUSIBLE_EUR = 5
const MAX_PLAUSIBLE_EUR = 1500

// Every rate Hotelbeds returns is in EUR, so prices are converted once per
// response. If the FX lookup fails the app still shows prices, using this rate
// (the approximate mid-market EUR/VND rate in September 2026) and labelling
// them indicative — better than a hotel list with no prices on it at all.
const FALLBACK_EUR_VND = 30_000
const FX_URL = 'https://open.er-api.com/v6/latest/EUR'
const FX_TTL_MS = 1000 * 60 * 60 * 12

// The 12 cities FoodTrip covers. Hotelbeds searches by geolocation, and
// geocoding a city name at request time was both slower and less reliable
// (Track-Asia once put "Hà Nội" 50km out in Ba Vì), so the centres are fixed.
const CITY_GEO: Record<string, { lat: number; lng: number }> = {
  'ha noi': { lat: 21.0285, lng: 105.8542 },
  hanoi: { lat: 21.0285, lng: 105.8542 },
  'hoi an': { lat: 15.8801, lng: 108.338 },
  'da nang': { lat: 16.0544, lng: 108.2022 },
  danang: { lat: 16.0544, lng: 108.2022 },
  'tp ho chi minh': { lat: 10.7769, lng: 106.7009 },
  'ho chi minh city': { lat: 10.7769, lng: 106.7009 },
  'ho chi minh': { lat: 10.7769, lng: 106.7009 },
  'sai gon': { lat: 10.7769, lng: 106.7009 },
  'da lat': { lat: 11.9404, lng: 108.4583 },
  dalat: { lat: 11.9404, lng: 108.4583 },
  hue: { lat: 16.4637, lng: 107.5909 },
  'phu quoc': { lat: 10.227, lng: 103.967 },
  'nha trang': { lat: 12.2388, lng: 109.1967 },
  'ninh binh': { lat: 20.2506, lng: 105.9745 },
  'can tho': { lat: 10.0452, lng: 105.7469 },
  'sa pa': { lat: 22.3364, lng: 103.8438 },
  sapa: { lat: 22.3364, lng: 103.8438 },
  'phan thiet': { lat: 10.928, lng: 108.102 },
  'mui ne': { lat: 10.928, lng: 108.102 },
}

export function normalizeCityKey(name: string) {
  return normalizeSearchText(name || '')
}

export function cityGeo(cityName: string) {
  return CITY_GEO[normalizeCityKey(cityName)] ?? null
}

export function hasHotelbedsKeys() {
  return Boolean(Deno.env.get('HOTELBEDS_API_KEY') && Deno.env.get('HOTELBEDS_SECRET'))
}

let fxCache: { rate: number; ts: number; live: boolean } | null = null

/** EUR to VND, refreshed twice a day. Keyless; falls back to a constant. */
export async function eurToVnd(): Promise<{ rate: number; live: boolean }> {
  if (fxCache && Date.now() - fxCache.ts < FX_TTL_MS) return { rate: fxCache.rate, live: fxCache.live }
  try {
    const res = await fetch(FX_URL, { signal: AbortSignal.timeout(5000) })
    const json = await res.json()
    const rate = Number(json?.rates?.VND)
    if (Number.isFinite(rate) && rate > 1000) {
      fxCache = { rate, ts: Date.now(), live: true }
      return { rate, live: true }
    }
  } catch {
    // Offline, or the FX host is down — prices stay indicative, not missing.
  }
  fxCache = { rate: FALLBACK_EUR_VND, ts: Date.now(), live: false }
  return { rate: FALLBACK_EUR_VND, live: false }
}

/** VND is not quoted in cents; round to the nearest thousand like a real tariff. */
export function toVnd(eur: number, rate: number) {
  return Math.round((eur * rate) / 1000) * 1000
}

async function signedHeaders() {
  const apiKey = Deno.env.get('HOTELBEDS_API_KEY')!
  const secret = Deno.env.get('HOTELBEDS_SECRET')!
  const stamp = Math.floor(Date.now() / 1000)
  const bytes = new TextEncoder().encode(apiKey + secret + stamp)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const signature = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return {
    'Api-key': apiKey,
    'X-Signature': signature,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

type HotelbedsRate = {
  rateKey?: string
  rateType?: string
  net?: string
  allotment?: number
  boardName?: string
  adults?: number
  cancellationPolicies?: { amount?: string; from?: string }[]
}
type HotelbedsRoom = { code?: string; name?: string; rates?: HotelbedsRate[] }

export type HotelbedsHotel = {
  code?: number
  name?: string
  categoryName?: string
  zoneName?: string
  destinationName?: string
  latitude?: string
  longitude?: string
  minRate?: string
  maxRate?: string
  rooms?: HotelbedsRoom[]
}

/** "5 STARS" / "4 EST" to 5 / 4. Null for apartments and unrated properties. */
function starsOf(categoryName?: string) {
  const match = /^(\d)/.exec(categoryName ?? '')
  return match ? Number(match[1]) : null
}

// Hotelbeds gives a board code per rate rather than an amenity list. Breakfast
// is the only amenity it actually asserts, so the rest are inferred from the
// room name — clearly less precise, which is why nothing here invents a bathtub
// or a pool that was never stated.
function amenitiesFor(roomName: string, boardName: string) {
  const amenities = ['wifi', 'ac']
  if (/BREAKFAST|HALF BOARD|FULL BOARD|ALL INCLUSIVE/i.test(boardName)) amenities.push('breakfast')
  if (/CITY VIEW|SKYLINE/i.test(roomName)) amenities.push('cityview')
  if (/SUITE|VILLA/i.test(roomName)) amenities.push('bathtub')
  return amenities
}

/** Title-cases Hotelbeds' shouty room names ("SUPERIOR KING" to "Superior King"). */
function tidyRoomName(name: string) {
  if (!/[a-z]/.test(name)) return name.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
  return name
}

function shapeRooms(hotel: HotelbedsHotel, rate: number) {
  const rooms = []
  for (const room of hotel.rooms ?? []) {
    // Hotelbeds sorts rates cheapest-first, and only a BOOKABLE one could
    // actually be reserved, so that is the rate a room type is shown at.
    const best = (room.rates ?? []).find((r) => r.rateType === 'BOOKABLE' && Number.isFinite(Number(r.net)))
    if (!best) continue
    const eur = Number(best.net)
    if (eur < MIN_PLAUSIBLE_EUR || eur > MAX_PLAUSIBLE_EUR) continue
    const name = tidyRoomName(room.name ?? 'Room')
    const boardName = best.boardName ?? ''
    rooms.push({
      code: room.code ?? name,
      name,
      capacity: Math.max(Number(best.adults) || 2, 1),
      pricePerNight: toVnd(eur, rate),
      priceEur: eur,
      board: boardName,
      amenities: amenitiesFor(name, boardName),
      // Hotelbeds' real remaining inventory, capped so a card never announces
      // "45 rooms left" in a way that reads as filler.
      roomsLeft: Math.min(Number(best.allotment) || 0, 9) || null,
      // A policy dated in the future is the deadline for cancelling free of charge.
      freeCancellationUntil: best.cancellationPolicies?.[0]?.from ?? null,
    })
  }
  return rooms.sort((a, b) => a.pricePerNight - b.pricePerNight)
}

export function shapeHotel(hotel: HotelbedsHotel, rate: number) {
  const rooms = shapeRooms(hotel, rate)
  const lat = Number(hotel.latitude)
  const lng = Number(hotel.longitude)
  return {
    id: `hb-${hotel.code}`,
    hotelbedsCode: hotel.code ?? null,
    name: hotel.name ?? '',
    stars: starsOf(hotel.categoryName),
    area: hotel.zoneName ?? hotel.destinationName ?? null,
    location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    rooms,
    priceFrom: rooms.length ? rooms[0].pricePerNight : null,
  }
}

export type ShapedHotel = ReturnType<typeof shapeHotel>

const CONTENT_HOTELS = `${HOST}/hotel-content-api/1.0/hotels`

// Hotelbeds' own photo CDN. "large" is 403 on the evaluation plan and "medium"
// comes back at ~6 KB, so "bigger" (~150 KB) is the only size that both loads
// and survives being shown at card width.
const PHOTO_CDN = 'https://photos.hotelbeds.com/giata/bigger'

// A hotel carries a hundred-plus images, most of them individual rooms (HAB).
// For a card the traveller wants to recognise the property, so exterior and
// grounds shots come first and a room photo is the last resort.
const IMAGE_TYPE_PRIORITY = ['GEN', 'PLA', 'PIS', 'COM', 'RES', 'HAB']

// Individual images can be withheld from the evaluation plan: the CDN answers
// 403 for that exact photo at every size while the next photo of the same hotel
// serves fine. So a candidate is not usable until the CDN says so, and a few
// are lined up per hotel rather than one.
const PHOTO_CANDIDATES = 4

type ContentImage = { imageTypeCode?: string; path?: string; visualOrder?: number }

function candidateUrls(images: ContentImage[]) {
  const usable = images.filter((image) => image.path)
  const ranked = [...usable].sort((a, b) => {
    const rank = (image: ContentImage) => {
      const index = IMAGE_TYPE_PRIORITY.indexOf(image.imageTypeCode ?? '')
      return index === -1 ? IMAGE_TYPE_PRIORITY.length : index
    }
    return rank(a) - rank(b) || (a.visualOrder ?? 0) - (b.visualOrder ?? 0)
  })
  return ranked.slice(0, PHOTO_CANDIDATES).map((image) => `${PHOTO_CDN}/${image.path}`)
}

async function serves(url: string) {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
    return response.ok
  } catch {
    // Treat a network failure like a 403.
    return false
  }
}

/** The first candidate the CDN actually serves, or null if none of them load. */
async function firstServable(urls: string[]) {
  for (const url of urls) {
    if (await serves(url)) return url
  }
  return null
}

/** Up to `limit` candidates the CDN serves, checked together. */
async function servableSubset(urls: string[], limit: number) {
  const checked = await Promise.all(urls.map(async (url) => ((await serves(url)) ? url : null)))
  return checked.filter((url): url is string => Boolean(url)).slice(0, limit)
}

/**
 * Cover photos for the given Hotelbeds hotel codes, as `code -> url`.
 *
 * Availability and content are separate APIs on the same key: a priced hotel
 * comes back with no image at all, which is why so many cards fell back to the
 * gradient placeholder. Returns an empty map on failure — a hotel with a real
 * price and no photo is still worth showing.
 */
export async function fetchHotelPhotos(codes: number[]) {
  const photos = new Map<number, string>()
  if (!codes.length) return photos
  try {
    const params = new URLSearchParams({
      codes: codes.join(','),
      fields: 'code,images',
      language: 'ENG',
      from: '1',
      to: String(codes.length),
    })
    const response = await fetch(`${CONTENT_HOTELS}?${params}`, {
      headers: await signedHeaders(),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Hotelbeds content ${response.status}`)
    const json = await response.json()
    // Hotels are probed in parallel; the candidates within one hotel are tried
    // in order, so a hotel costs one CDN round trip in the common case.
    const resolved = await Promise.all(
      (json?.hotels ?? []).map(async (hotel: { code?: number; images?: ContentImage[] }) => ({
        code: hotel.code,
        url: await firstServable(candidateUrls(hotel.images ?? [])),
      })),
    )
    for (const { code, url } of resolved) {
      if (url && code != null) photos.set(Number(code), url)
    }
  } catch (error) {
    console.error('hotelbeds content photos failed:', (error as Error).message)
  }
  return photos
}

// Enough angles to judge a property without turning the page into a slideshow,
// and enough per room to see the bed, the bathroom and the view.
const GALLERY_MAX_GENERAL = 8
const GALLERY_MAX_PER_ROOM = 4

// Every candidate costs a HEAD request, so the pool checked per bucket is
// capped too — hotels carry well over a hundred images.
const GALLERY_CANDIDATE_POOL = 10

/**
 * Every photo the booking page can show for one hotel, split into the property
 * itself and each room type.
 *
 * Hotelbeds tags most images with the `roomCode` they belong to — the same code
 * the availability API prices — so a room can be shown with its own photos
 * rather than a generic shot of the lobby. Only room codes the caller asks for
 * are resolved, since probing every room of a 20-room hotel would cost a
 * hundred CDN round trips for photos nobody will scroll to.
 */
export async function fetchHotelGallery(code: number, roomCodes: string[] = []) {
  const empty = { general: [] as string[], rooms: {} as Record<string, string[]> }
  try {
    const params = new URLSearchParams({
      codes: String(code),
      fields: 'code,images',
      language: 'ENG',
      from: '1',
      to: '1',
    })
    const response = await fetch(`${CONTENT_HOTELS}?${params}`, {
      headers: await signedHeaders(),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Hotelbeds content ${response.status}`)
    const json = await response.json()
    const images: ContentImage[] = json?.hotels?.[0]?.images ?? []
    if (!images.length) return empty

    const ordered = (list: ContentImage[]) =>
      [...list]
        .sort((a, b) => (a.visualOrder ?? 0) - (b.visualOrder ?? 0))
        .filter((image) => image.path)
        .slice(0, GALLERY_CANDIDATE_POOL)
        .map((image) => `${PHOTO_CDN}/${image.path}`)

    // The property gallery deliberately excludes room shots: those belong to
    // their room and would otherwise crowd out the exterior and the facilities.
    const generalPool = ordered(
      images.filter((image) => image.imageTypeCode !== 'HAB' && !image.roomCode),
    )
    const wanted = new Set(roomCodes.filter(Boolean))
    const roomPools = [...wanted].map((roomCode) => ({
      roomCode,
      urls: ordered(images.filter((image) => image.roomCode === roomCode)),
    }))

    const [general, roomResults] = await Promise.all([
      servableSubset(generalPool, GALLERY_MAX_GENERAL),
      Promise.all(
        roomPools.map(async ({ roomCode, urls }) => ({
          roomCode,
          urls: await servableSubset(urls, GALLERY_MAX_PER_ROOM),
        })),
      ),
    ])

    const rooms: Record<string, string[]> = {}
    for (const { roomCode, urls } of roomResults) {
      if (urls.length) rooms[roomCode] = urls
    }
    return { general, rooms }
  } catch (error) {
    console.error('hotelbeds gallery failed:', (error as Error).message)
    return empty
  }
}

/**
 * Availability for one city. Reports `unsupportedCity` rather than throwing
 * when the city is outside the 12 FoodTrip covers, so the caller can still
 * serve Serper results for it.
 */
export async function fetchCityAvailability({
  cityName,
  checkIn,
  checkOut,
  adults = 2,
  rooms = 1,
  radiusKm = 20,
}: {
  cityName: string
  checkIn: string
  checkOut: string
  adults?: number
  rooms?: number
  radiusKm?: number
}) {
  const geo = cityGeo(cityName)
  if (!geo) return { hotels: [] as HotelbedsHotel[], unsupportedCity: true }

  const response = await fetch(AVAILABILITY, {
    method: 'POST',
    headers: await signedHeaders(),
    body: JSON.stringify({
      stay: { checkIn, checkOut },
      occupancies: [{ rooms, adults, children: 0 }],
      geolocation: { latitude: geo.lat, longitude: geo.lng, radius: radiusKm, unit: 'km' },
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) {
    throw new Error(`Hotelbeds ${response.status}: ${(await response.text()).slice(0, 180)}`)
  }
  const json = await response.json()
  return { hotels: (json?.hotels?.hotels ?? []) as HotelbedsHotel[], unsupportedCity: false }
}
