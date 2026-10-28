import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { isRelevantToPlace, searchName } from '../_shared/relevance.ts'
import { isAboutVenue } from '../_shared/venueMatch.ts'
import { hasSerperKey, serper, type SerperItem } from '../_shared/serper.ts'
import { afterResponse, cacheKeyPart, readSearchCache, writeSearchCache } from '../_shared/searchCache.ts'

const TIKTOK_VIDEO_URL_RE = /^https:\/\/(www\.)?tiktok\.com\/@([\w.-]+)\/video\/\d+/

const HOUR = 3600e3
const FOUND_TTL_MS = 7 * 24 * HOUR // which videos are about the place changes slowly
const EMPTY_TTL_MS = 24 * HOUR // but a place with none yet may get one soon
// TikTok's thumbnail links are signed and stop working after ~2 days (their
// x-expires); they are refreshed through oEmbed a little before that, which
// costs no Serper credits.
const THUMB_MARGIN_MS = HOUR
const THUMB_UNKNOWN_TTL_MS = 24 * HOUR
// A video kept without TikTok's thumbnail shows Google's meanwhile, and asks
// TikTok again after this.
const RETRY_THUMBS_MS = 6 * HOUR
// While stale thumbnails refresh in the background, the browser keeps its copy
// only this long before asking again.
const REFRESHING_STALE_MS = 15 * 60e3

// TikTok's oEmbed answers 429/503 to a burst and, from some data-centre
// addresses, can hold a request open for ~30 s. Three at a time, a short
// timeout and one retry keep a search to a few seconds without losing videos.
const OEMBED_TIMEOUT_MS = 5000
const OEMBED_CONCURRENCY = 3
const MAX_CANDIDATES = 10
const MAX_VIDEOS = 6

// googleThumbUrl is the thumbnail from Google's results: ~4 KB and lasting,
// so it is the one shown. thumbnailUrl is TikTok's own, only for a video Google
// gave no image for: its link is signed (cannot be resized) and expires after
// ~2 days, and the file is the full-size frame, measured at 0.3–4.7 MB.
type Video = { videoUrl: string; title: string; authorName: string; thumbnailUrl: string | null; googleThumbUrl: string | null }
type Cached = { videos: Video[]; thumbsExpireAt: number }
type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string }
type OEmbedResult = { data: OEmbed } | { gone: true } | { unavailable: true }

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** oEmbed for one video: its data, `gone` (deleted or private), or `unavailable` (TikTok refused or stalled twice). */
async function fetchOEmbed(videoUrl: string): Promise<OEmbedResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, {
        headers: { 'user-agent': 'Mozilla/5.0 (FoodTrip video-discovery feature)' },
        signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
      })
      if (res.ok) return { data: await res.json() }
      if (res.status !== 429 && res.status < 500) return { gone: true }
    } catch {
      // timed out or dropped — retried below
    }
    if (attempt === 0) await delay(400 + Math.random() * 400)
  }
  return { unavailable: true }
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping their order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

/** When a signed TikTok thumbnail link stops working. */
function thumbExpiry(thumbnailUrl: string | null, now: number) {
  if (!thumbnailUrl) return now + RETRY_THUMBS_MS
  try {
    const seconds = Number(new URL(thumbnailUrl).searchParams.get('x-expires'))
    return seconds ? seconds * 1000 - THUMB_MARGIN_MS : now + THUMB_UNKNOWN_TTL_MS
  } catch {
    return now + THUMB_UNKNOWN_TTL_MS
  }
}

/** When the first thumbnail shown stops working; a Google one never does. */
const earliestThumbExpiry = (videos: Video[], now: number) =>
  videos.length ? Math.min(now + FOUND_TTL_MS, ...videos.map((v) => (v.googleThumbUrl ? Infinity : thumbExpiry(v.thumbnailUrl, now)))) : now + EMPTY_TTL_MS

/**
 * Auto-discovers real TikTok videos about a place. TikTok itself has no
 * public search API, so this searches Google's Videos tab (via Serper), keeps
 * only links to single TikTok videos, then fetches each one's real oEmbed data.
 *
 * Two queries, because neither finds everything: "<name> tiktok" pulls in
 * whoever shares a word with the name (a singer called Hương Ly, for Bún Chả
 * Hương Liên), while "<name> review" finds the food videos but mixes in other
 * platforms. The relevance checks below are what keep the result honest.
 */
async function searchTikTokVideos(placeName: string, location: string, address: string, timing: Record<string, number>) {
  const base = `${searchName(placeName)} ${location}`
  let started = Date.now()
  const results = await Promise.allSettled([serper('videos', `${base} tiktok`), serper('videos', `${base} review`)])
  timing.serper = Date.now() - started
  const found = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!found.length && results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason

  // Google's snippet is a cut-down caption, so it only has to name the venue
  // here; the full test runs once the real caption is in hand.
  const venue = { name: placeName, address, area: location }
  const google = new Map<string, { title: string; text: string; image: string | null }>()
  for (const it of found as SerperItem[]) {
    const link = it.link || ''
    if (!TIKTOK_VIDEO_URL_RE.test(link) || google.has(link)) continue
    const text = `${it.title || ''} ${it.snippet || ''}`
    const image = /^(https:|data:image\/)/.test(it.imageUrl || '') ? it.imageUrl! : null
    if (isRelevantToPlace(text, placeName)) google.set(link, { title: it.title || '', text, image })
  }
  const candidateLinks = [...google.keys()].slice(0, MAX_CANDIDATES)

  started = Date.now()
  const checked = await mapLimit(candidateLinks, OEMBED_CONCURRENCY, async (link): Promise<Video | null> => {
    const oe = await fetchOEmbed(link)
    if ('gone' in oe) return null
    const seen = google.get(link)!
    if ('data' in oe) {
      // The evidence can sit in the full caption or only in Google's snippet.
      if (!isAboutVenue({ title: oe.data.title || '', body: seen.text, url: link, author: oe.data.author_name }, venue)) return null
      return { videoUrl: link, title: oe.data.title || seen.title, authorName: oe.data.author_name || '', thumbnailUrl: oe.data.thumbnail_url || null, googleThumbUrl: seen.image }
    }
    // TikTok would not answer for this one right now. Judge it on Google's
    // snippet alone rather than dropping a real video; its thumbnail is
    // fetched on a later refresh.
    if (!isAboutVenue({ title: seen.title, body: seen.text, url: link }, venue)) return null
    return { videoUrl: link, title: seen.title, authorName: link.match(TIKTOK_VIDEO_URL_RE)?.[2] ?? '', thumbnailUrl: null, googleThumbUrl: seen.image }
  })
  timing.oembed = Date.now() - started
  return checked.filter((v): v is Video => v !== null).slice(0, MAX_VIDEOS)
}

/** New TikTok thumbnail links for cached videos that rely on them, without searching again. */
async function refreshThumbnails(videos: Video[], timing: Record<string, number>) {
  const started = Date.now()
  const now = Date.now()
  const refreshed = await mapLimit(videos, OEMBED_CONCURRENCY, async (video): Promise<Video | null> => {
    if (video.googleThumbUrl) return video
    const oe = await fetchOEmbed(video.videoUrl)
    if ('gone' in oe) return null // deleted since
    if ('data' in oe) return { ...video, title: oe.data.title || video.title, authorName: oe.data.author_name || video.authorName, thumbnailUrl: oe.data.thumbnail_url || null }
    return { ...video, thumbnailUrl: thumbExpiry(video.thumbnailUrl, now) > now ? video.thumbnailUrl : null }
  })
  timing.oembed = Date.now() - started
  return refreshed.filter((v): v is Video => v !== null)
}

function respond(videos: Video[], staleAt: number, cache: string, timing: Record<string, number>) {
  const now = Date.now()
  const serverTiming = [`cache;desc=${cache}`, ...Object.entries(timing).map(([k, v]) => `${k};dur=${v}`)].join(', ')
  const shown = videos.map((v) => ({
    videoUrl: v.videoUrl, title: v.title, authorName: v.authorName,
    thumbnailUrl: v.googleThumbUrl ?? (v.thumbnailUrl && thumbExpiry(v.thumbnailUrl, now) > now ? v.thumbnailUrl : null),
  }))
  // staleAt tells the browser how long its own copy stays good: until the
  // first thumbnail link expires.
  return jsonResponse({ status: 'ok', videos: shown, staleAt: new Date(staleAt).toISOString() }, { headers: { 'server-timing': serverTiming } })
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const params = new URL(req.url).searchParams
  const query = params.get('query')
  if (!query) return jsonResponse({ error: 'missing-query' }, { status: 400 })
  const placeName = params.get('name')?.trim() || query
  const location = params.get('location')?.trim() || ''
  const address = params.get('address')?.trim() || ''
  const timing: Record<string, number> = {}
  const key = `tiktok:v3:${cacheKeyPart(placeName)}|${cacheKeyPart(location)}|${cacheKeyPart(address)}`

  try {
    const now = Date.now()
    const hit = await readSearchCache<Cached>(key)
    timing.cache = Date.now() - now
    if (hit && hit.expiresAt > now) {
      if (hit.payload.thumbsExpireAt > now) return respond(hit.payload.videos, Math.min(hit.payload.thumbsExpireAt, hit.expiresAt), 'hit', timing)
      // Answer now with what is cached (an expired TikTok thumbnail gives way
      // to Google's) and fetch fresh thumbnails after the response.
      const refresh = refreshThumbnails(hit.payload.videos, {}).then((videos) =>
        writeSearchCache(key, { videos, thumbsExpireAt: earliestThumbExpiry(videos, Date.now()) }, hit.expiresAt))
      const pending = afterResponse(refresh)
      if (pending) await pending
      return respond(hit.payload.videos, Math.min(now + REFRESHING_STALE_MS, hit.expiresAt), 'stale', timing)
    }

    if (!hasSerperKey()) return jsonResponse({ status: 'no-key', videos: [] })
    const videos = await searchTikTokVideos(placeName, location, address, timing)
    const expiresAt = Date.now() + (videos.length ? FOUND_TTL_MS : EMPTY_TTL_MS)
    const thumbsExpireAt = earliestThumbExpiry(videos, Date.now())
    await writeSearchCache(key, { videos, thumbsExpireAt }, expiresAt)
    return respond(videos, Math.min(thumbsExpireAt, expiresAt), 'miss', timing)
  } catch (err) {
    console.error('tiktok-web-search failed:', (err as Error).message)
    return jsonResponse({ error: 'search-failed', message: (err as Error).message }, { status: 502 })
  }
})
