import { jsonResponse, handleOptions } from '../_shared/cors.ts'

const SEARCH_URL = 'https://www.googleapis.com/customsearch/v1'
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
 * public search API, so this uses Google's official Custom Search JSON API
 * (a legitimate, ToS-compliant way to query Google's search index — not
 * scraping) restricted to tiktok.com, then confirms each hit is an actual
 * video page (not a profile/hashtag page) and fetches its real oEmbed data.
 */
async function searchTikTokVideos(query: string) {
  const apiKey = Deno.env.get('GOOGLE_CUSTOM_SEARCH_KEY')
  const cx = Deno.env.get('GOOGLE_CUSTOM_SEARCH_CX')
  if (!apiKey || !cx) return { status: 'no-key', videos: [] }

  const params = new URLSearchParams({ key: apiKey, cx, q: `${query} site:tiktok.com`, num: '10' })
  const res = await fetch(`${SEARCH_URL}?${params}`)
  if (!res.ok) throw new Error(`Custom Search ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const candidateLinks = (json.items || [])
    .map((it: { link?: string }) => it.link)
    .filter((link: string | undefined) => TIKTOK_VIDEO_URL_RE.test(link || ''))
    .slice(0, 5)

  if (!candidateLinks.length) return { status: 'ok', videos: [] }

  const oembeds = await Promise.all(
    candidateLinks.map(async (link: string) => {
      try {
        const oe = await fetchTikTokOEmbedData(link)
        if (!oe) return null
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
  try {
    const result = await searchTikTokVideos(query)
    return jsonResponse(result)
  } catch (err) {
    console.error('tiktok-web-search failed:', (err as Error).message)
    return jsonResponse({ error: 'search-failed', message: (err as Error).message }, { status: 502 })
  }
})
