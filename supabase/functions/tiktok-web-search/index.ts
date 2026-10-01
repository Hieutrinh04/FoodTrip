import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { isRelevantToPlace, searchName } from '../_shared/relevance.ts'
import { isAboutVenue } from '../_shared/venueMatch.ts'
import { hasSerperKey, serper, type SerperItem } from '../_shared/serper.ts'

const TIKTOK_VIDEO_URL_RE = /^https:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/

async function fetchTikTokOEmbedData(videoUrl: string) {
  const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (FoodTrip video-discovery feature)' },
  })
  if (!res.ok) return null
  return res.json()
}

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
async function searchTikTokVideos(placeName: string, location: string, address: string) {
  if (!hasSerperKey()) return { status: 'no-key', videos: [] }

  const base = `${searchName(placeName)} ${location}`
  const results = await Promise.allSettled([serper('videos', `${base} tiktok`), serper('videos', `${base} review`)])
  const found = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!found.length && results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason

  // Google's snippet is a cut-down caption, so it only has to name the venue
  // here; the full test runs once the real caption is in hand.
  const venue = { name: placeName, address, area: location }
  const searchText = new Map<string, string>()
  for (const it of found as SerperItem[]) {
    const link = it.link || ''
    if (!TIKTOK_VIDEO_URL_RE.test(link) || searchText.has(link)) continue
    const text = `${it.title || ''} ${it.snippet || ''}`
    if (isRelevantToPlace(text, placeName)) searchText.set(link, text)
  }
  const candidateLinks = [...searchText.keys()].slice(0, 10)
  if (!candidateLinks.length) return { status: 'ok', videos: [] }

  const oembeds = await Promise.all(
    candidateLinks.map(async (link: string) => {
      try {
        const oe = await fetchTikTokOEmbedData(link)
        if (!oe) return null
        // The evidence can sit in the full caption or only in Google's snippet.
        if (!isAboutVenue({ title: oe.title || '', body: searchText.get(link), url: link, author: oe.author_name }, venue)) return null
        return { videoUrl: link, title: oe.title, authorName: oe.author_name, thumbnailUrl: oe.thumbnail_url, embedHtml: oe.html }
      } catch {
        return null
      }
    })
  )

  return { status: 'ok', videos: oembeds.filter(Boolean).slice(0, 6) }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const query = new URL(req.url).searchParams.get('query')
  if (!query) return jsonResponse({ error: 'missing-query' }, { status: 400 })
  const placeName = new URL(req.url).searchParams.get('name')?.trim() || query
  const location = new URL(req.url).searchParams.get('location')?.trim() || ''
  try {
    const address = new URL(req.url).searchParams.get('address')?.trim() || ''
    return jsonResponse(await searchTikTokVideos(placeName, location, address))
  } catch (err) {
    console.error('tiktok-web-search failed:', (err as Error).message)
    return jsonResponse({ error: 'search-failed', message: (err as Error).message }, { status: 502 })
  }
})
