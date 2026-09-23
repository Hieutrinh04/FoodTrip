import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { hasLocationEvidence, isRelevantToPlace, primaryName } from '../_shared/relevance.ts'

const SEARCH_URL = 'https://google.serper.dev/search'
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
 * public search API, so this uses Serper's search API restricted to
 * tiktok.com, then confirms each hit is an actual
 * video page (not a profile/hashtag page) and fetches its real oEmbed data.
 */
async function searchTikTokVideos(query: string, placeName: string, location: string) {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) return { status: 'no-key', videos: [] }

  const name = primaryName(placeName)
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q: `"${name}" ${location} review site:tiktok.com`.replace(/\s+/g, ' ').trim(), num: 12, gl: 'vn', hl: 'vi' }),
  })
  if (!res.ok) throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const candidateLinks = (json.organic || [])
    .filter((it: { title?: string; snippet?: string }) =>
      isRelevantToPlace(it.title || '', name) &&
      (!location.trim() || hasLocationEvidence(`${it.title || ''} ${it.snippet || ''}`, location)))
    .map((it: { link?: string }) => it.link)
    .filter((link: string | undefined) => TIKTOK_VIDEO_URL_RE.test(link || ''))
    .slice(0, 6)

  if (!candidateLinks.length) return { status: 'ok', videos: [] }

  const oembeds = await Promise.all(
    candidateLinks.map(async (link: string) => {
      try {
        const oe = await fetchTikTokOEmbedData(link)
        if (!oe || !isRelevantToPlace(oe.title || '', name)) return null
        if (location.trim() && !hasLocationEvidence(oe.title || '', location)) return null
        return { videoUrl: link, title: oe.title, authorName: oe.author_name, thumbnailUrl: oe.thumbnail_url, embedHtml: oe.html }
      } catch {
        return null
      }
    })
  )

  return { status: 'ok', videos: oembeds.filter(Boolean) }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const query = new URL(req.url).searchParams.get('query')
  if (!query) return jsonResponse({ error: 'missing-query' }, { status: 400 })
  const placeName = new URL(req.url).searchParams.get('name')?.trim() || query
  const location = new URL(req.url).searchParams.get('location')?.trim() || ''
  try {
    const result = await searchTikTokVideos(query, placeName, location)
    return jsonResponse(result)
  } catch (err) {
    console.error('tiktok-web-search failed:', (err as Error).message)
    return jsonResponse({ error: 'search-failed', message: (err as Error).message }, { status: 502 })
  }
})
